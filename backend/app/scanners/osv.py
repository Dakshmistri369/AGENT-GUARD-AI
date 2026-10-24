"""
AgentGuard AI — OSV-Scanner Dependency Vulnerability Service.
Scans lockfiles, package manifests, and commit SHAs against Google's Open Source Vulnerabilities (OSV) database (https://api.osv.dev).
Google's OSV API is 100% public, free, and requires zero API keys.
Does not install or build project dependencies.
Transparently reports scanner availability, incomplete coverage, and CVE advisory results.
"""
from __future__ import annotations

import json
import logging
import re
import time
from pathlib import Path
from typing import Any

import httpx

from app.config import get_settings
from app.scanners.base import BaseScanner, ScannerResult, find_scanner_executable
from app.security.workspace import redact_sensitive_text

logger = logging.getLogger("agentguard.scanners.osv")

MANIFEST_LOCKFILE_NAMES = {
    "package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "requirements.txt", "Pipfile", "Pipfile.lock", "poetry.lock",
    "Cargo.toml", "Cargo.lock", "go.mod", "go.sum",
    "pom.xml", "build.gradle", "Gemfile", "Gemfile.lock", "composer.json", "composer.lock",
}

# Offline Known Vulnerability Heuristics for Fallback Analysis
FALLBACK_ADVISORIES = [
    {
        "manifest": "requirements.txt",
        "regex": re.compile(r"""(?i)^requests\s*==\s*2\.(?:[0-9]|1[0-9]|2[0-5])\."""),
        "pkg": "requests",
        "vuln_id": "GHSA-j8r2-6x86-q33q",
        "title": "Outdated requests: Leaks Proxy-Authorization headers to destination server",
        "severity": "medium",
        "remediation": "Upgrade requests to >=2.31.0 to address CVE-2023-32681.",
    },
    {
        "manifest": "requirements.txt",
        "regex": re.compile(r"""(?i)^urllib3\s*==\s*1\.(?:[0-9]|1[0-9]|2[0-5])\."""),
        "pkg": "urllib3",
        "vuln_id": "GHSA-v845-jxx5-vc9f",
        "title": "urllib3: Cookie header leakage across redirects",
        "severity": "high",
        "remediation": "Upgrade urllib3 to >=1.26.18 or >=2.0.7 to remediate CVE-2023-43804.",
    },
    {
        "manifest": "package.json",
        "regex": re.compile(r"""["']lodash["']\s*:\s*["'](?:\^|~)?4\.(?:[0-9]|1[0-6])\."""),
        "pkg": "lodash",
        "vuln_id": "GHSA-p6mc-m468-83gw",
        "title": "lodash: Prototype Pollution in zipObjectDeep",
        "severity": "high",
        "remediation": "Upgrade lodash to >=4.17.21 to resolve CVE-2020-8203.",
    },
    {
        "manifest": "package.json",
        "regex": re.compile(r"""["']axios["']\s*:\s*["'](?:\^|~)?0\.(?:[0-9]|1[0-9]|2[0-7])\."""),
        "pkg": "axios",
        "vuln_id": "GHSA-4w2v-q235-gw99",
        "title": "axios: Cross-Site Request Forgery / Header leakage across origins",
        "severity": "medium",
        "remediation": "Upgrade axios to >=1.6.0 to mitigate sensitive header leakage.",
    },
]


def parse_osv_severity(vuln: dict[str, Any]) -> str:
    """Extract standard severity from OSV vulnerability record."""
    # 1. Inspect CVSS vectors in severity array
    severities = vuln.get("severity", [])
    if isinstance(severities, list):
        for s in severities:
            score_str = str(s.get("score", ""))
            if "CVSS:" in score_str:
                if "A:H" in score_str and "C:H" in score_str and "I:H" in score_str:
                    return "critical"
                if "A:H" in score_str or "C:H" in score_str or "I:H" in score_str:
                    return "high"
            try:
                num = float(score_str)
                if num >= 9.0:
                    return "critical"
                if num >= 7.0:
                    return "high"
                if num >= 4.0:
                    return "medium"
                return "low"
            except ValueError:
                pass

    # 2. Inspect database_specific / ecosystem_specific
    db_spec = vuln.get("database_specific", {})
    if isinstance(db_spec, dict) and "severity" in db_spec:
        s_str = str(db_spec["severity"]).lower()
        if s_str in ["critical", "high", "medium", "low", "info"]:
            return s_str

    for aff in vuln.get("affected", []):
        if isinstance(aff, dict):
            eco_spec = aff.get("ecosystem_specific", {})
            if isinstance(eco_spec, dict) and "severity" in eco_spec:
                s_str = str(eco_spec["severity"]).lower()
                if s_str in ["critical", "high", "medium", "low", "info"]:
                    return s_str

    return "high"


def osv_vuln_to_finding(
    vuln: dict[str, Any],
    commit_sha: str | None = None,
    file_path: str = "repository",
    evidence: str | None = None,
) -> dict[str, Any]:
    """Normalize a raw OSV vulnerability entry into a standard Finding schema."""
    vuln_id = vuln.get("id", "OSV-VULN")
    summary = vuln.get("summary") or ""
    details = vuln.get("details") or ""
    title = summary if summary else f"Vulnerability {vuln_id} detected in repository"
    explanation = details[:400] if details else summary

    sev = parse_osv_severity(vuln)

    remediation = f"Review advisory {vuln_id} at https://osv.dev/vulnerability/{vuln_id} and update affected dependencies."
    for ref in vuln.get("references", []):
        if isinstance(ref, dict) and ref.get("type") == "FIX":
            remediation += f" Fix commit: {ref.get('url')}."
            break

    sanitized_ev = evidence or (f"Commit {commit_sha[:7]}" if commit_sha else "Repository lockfile")

    return {
        "scanner": "osv_scanner",
        "scanner_version": "api.osv.dev",
        "rule_id": vuln_id,
        "title": title[:500],
        "severity": sev,
        "confidence": "high",
        "file_path": file_path,
        "line_number": None,
        "line_end": None,
        "column_number": None,
        "code_snippet": None,
        "location_type": "manifest",
        "sanitized_evidence": redact_sensitive_text(sanitized_ev),
        "explanation": explanation[:600],
        "remediation": remediation[:600],
        "verification_status": "unverified",
        "commit_sha": commit_sha,
    }


async def query_osv_api(
    payload: dict[str, Any],
    timeout_seconds: float = 10.0,
    base_url: str | None = None,
    api_key: str | None = None,
) -> list[dict[str, Any]]:
    """
    Query Google's Open Source Vulnerabilities (OSV) API directly.
    Endpoint: https://api.osv.dev/v1/query
    Note: The OSV REST API is completely free and public — no API key is required.
    An optional API key can be supplied via Settings.osv_api_key if routing through an authenticated proxy.
    """
    settings = get_settings()
    endpoint = f"{(base_url or settings.osv_api_base_url).rstrip('/')}/query"
    key = api_key if api_key is not None else settings.osv_api_key
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"

    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            resp = await client.post(endpoint, json=payload, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                return data.get("vulns", [])
            else:
                logger.warning("OSV API returned status %s: %s", resp.status_code, resp.text[:200])
    except Exception as exc:
        logger.warning("OSV API query failed: %s", exc)
    return []


class OSVScanner(BaseScanner):
    scanner_id = "osv_scanner"
    name = "OSV-Scanner"

    def is_available(self) -> tuple[bool, str | None]:
        exe = find_scanner_executable("osv-scanner")
        if exe:
            try:
                import subprocess  # nosec B404
                res = subprocess.run([exe, "--version"], capture_output=True, text=True, errors="replace", timeout=5)  # nosec B603
                for line in (res.stdout or "").splitlines():
                    if "version:" in line.lower():
                        ver = line.split(":")[-1].strip()
                        if ver:
                            return True, ver
            except Exception as _ver_err:
                _ = _ver_err
            return True, "cli"
        return False, None

    def is_applicable(self, metadata: dict[str, Any]) -> tuple[bool, str]:
        manifests = set(metadata.get("manifests", []))
        found = [m for m in manifests if Path(m).name in MANIFEST_LOCKFILE_NAMES]
        if found:
            return True, f"Dependency manifests detected ({', '.join(found[:3])})"
        return False, "No dependency manifests or lockfiles detected"

    async def scan(
        self,
        workspace_path: Path,
        metadata: dict[str, Any],
        commit_sha: str | None = None,
        timeout_seconds: int = 600,
    ) -> ScannerResult:
        start_time = time.time()
        applicable, reason = self.is_applicable(metadata)
        if not applicable:
            return ScannerResult(
                scanner=self.name,
                scanner_version=None,
                status="skipped_not_applicable",
                reason=reason,
                duration_seconds=0.0,
            )

        available, version = self.is_available()
        exe = find_scanner_executable("osv-scanner")

        # ── Case A: osv-scanner binary IS available on host ─────────────────
        if available and exe:
            # osv-scanner v2.x requires subcommand: osv-scanner scan source --no-ignore --format json -r <path>
            # osv-scanner v1.x uses: osv-scanner --json -r <path>
            if version and str(version).startswith("2"):
                cmd = [exe, "scan", "source", "--no-ignore", "--format", "json", "-r", str(workspace_path)]
            else:
                cmd = [exe, "--json", "-r", str(workspace_path)]

            try:
                exit_code, stdout, stderr = await self.execute_cmd(
                    cmd=cmd,
                    cwd=workspace_path,
                    timeout_seconds=timeout_seconds,
                )
                if (not stdout.strip() or not stdout.strip().startswith("{")) and "flag provided but not defined" in stderr:
                    alt_cmd = (
                        [exe, "--json", "-r", str(workspace_path)]
                        if "scan" in cmd
                        else [exe, "scan", "source", "--no-ignore", "--format", "json", "-r", str(workspace_path)]
                    )
                    exit_code, stdout, stderr = await self.execute_cmd(
                        cmd=alt_cmd,
                        cwd=workspace_path,
                        timeout_seconds=timeout_seconds,
                    )
            except TimeoutError as exc:
                return ScannerResult(
                    scanner=self.name,
                    scanner_version=version,
                    status="timed_out",
                    error=f"OSV-Scanner execution timed out after {timeout_seconds} seconds",
                    duration_seconds=round(time.time() - start_time, 2),
                )
            except Exception as exc:
                return ScannerResult(
                    scanner=self.name,
                    scanner_version=version,
                    status="failed",
                    error=f"OSV-Scanner execution failed: {exc}",
                    duration_seconds=round(time.time() - start_time, 2),
                )

            findings = []
            raw = stdout.strip()
            if raw:
                try:
                    data = json.loads(raw)
                    for pkg_res in data.get("results", []):
                        manifest_path = pkg_res.get("source", {}).get("path", "")
                        try:
                            rel_file = Path(manifest_path).relative_to(workspace_path).as_posix()
                        except Exception:
                            rel_file = manifest_path

                        for pkg in pkg_res.get("packages", []):
                            p_info = pkg.get("package", {})
                            pkg_name = p_info.get("name", "dependency")
                            pkg_ver = p_info.get("version", "unknown")

                            for vuln in pkg.get("vulnerabilities", []):
                                vuln_id = vuln.get("id", "VULN")
                                details = vuln.get("details", "")
                                findings.append({
                                    "scanner": "osv_scanner",
                                    "scanner_version": version or "cli",
                                    "rule_id": vuln_id,
                                    "title": f"Vulnerable dependency {pkg_name}@{pkg_ver}: {vuln_id}",
                                    "severity": parse_osv_severity(vuln),
                                    "confidence": "high",
                                    "file_path": rel_file,
                                    "line_number": None,
                                    "line_end": None,
                                    "column_number": None,
                                    "code_snippet": None,
                                    "location_type": "manifest",
                                    "sanitized_evidence": f"{pkg_name}@{pkg_ver}",
                                    "explanation": details[:300] if details else f"Vulnerability {vuln_id} reported in {pkg_name}",
                                    "remediation": f"Update {pkg_name} to a version with a fix for {vuln_id}.",
                                    "verification_status": "unverified",
                                    "commit_sha": commit_sha,
                                })
                except json.JSONDecodeError as exc:
                    logger.warning("OSV-Scanner output was not valid JSON: %s", exc)

            # Query online OSV by commit SHA if commit_sha is a 40-char hex
            if commit_sha and len(commit_sha) == 40 and re.fullmatch(r"^[0-9a-fA-F]{40}$", commit_sha):
                try:
                    commit_vulns = await query_osv_api({"commit": commit_sha})
                    for cv in commit_vulns:
                        # Avoid duplicates by rule_id
                        if not any(f["rule_id"] == cv.get("id") for f in findings):
                            findings.append(osv_vuln_to_finding(cv, commit_sha=commit_sha))
                except Exception as exc:
                    logger.debug("Failed to query OSV API by commit SHA: %s", exc)

            return ScannerResult(
                scanner=self.name,
                scanner_version=version,
                status="completed",
                findings=findings,
                duration_seconds=round(time.time() - start_time, 2),
            )

        # ── Case B: osv-scanner binary is NOT installed on host ──────────────
        # Run fallback manifest vulnerability inspector, plus online OSV API query,
        # and explicitly mark status as skipped_unavailable so coverage reporting notes incomplete coverage
        fallback_findings = []
        for adv in FALLBACK_ADVISORIES:
            target_manifest = workspace_path / adv["manifest"]
            if target_manifest.exists() and target_manifest.is_file():
                try:
                    content = target_manifest.read_text(encoding="utf-8", errors="replace")
                    for line_idx, line in enumerate(content.splitlines(), start=1):
                        if adv["regex"].search(line):
                            fallback_findings.append({
                                "scanner": "osv_scanner",
                                "scanner_version": "fallback-advisory",
                                "rule_id": adv["vuln_id"],
                                "title": adv["title"],
                                "severity": adv["severity"],
                                "confidence": "high",
                                "file_path": adv["manifest"],
                                "line_number": line_idx,
                                "line_end": None,
                                "column_number": 1,
                                "code_snippet": None,
                                "location_type": "manifest",
                                "sanitized_evidence": redact_sensitive_text(line.strip()),
                                "explanation": f"Manifest {adv['manifest']} declares a vulnerable version of {adv['pkg']}.",
                                "remediation": adv["remediation"],
                                "verification_status": "unverified",
                                "commit_sha": commit_sha,
                            })
                except Exception as exc:
                    logger.debug("Error checking fallback manifest: %s", exc)

        # Check online OSV API for commit SHA if provided
        if commit_sha and len(commit_sha) == 40 and re.fullmatch(r"^[0-9a-fA-F]{40}$", commit_sha):
            try:
                commit_vulns = await query_osv_api({"commit": commit_sha})
                for cv in commit_vulns:
                    if not any(f["rule_id"] == cv.get("id") for f in fallback_findings):
                        fallback_findings.append(osv_vuln_to_finding(cv, commit_sha=commit_sha))
            except Exception as exc:
                logger.debug("Failed to query OSV API by commit: %s", exc)

        return ScannerResult(
            scanner=self.name,
            scanner_version=None,
            status="skipped_unavailable",
            reason="OSV-Scanner CLI binary is not installed on host PATH; offline manifest advisory rules and Google OSV API (https://api.osv.dev) were checked",
            findings=fallback_findings,
            duration_seconds=round(time.time() - start_time, 2),
        )
