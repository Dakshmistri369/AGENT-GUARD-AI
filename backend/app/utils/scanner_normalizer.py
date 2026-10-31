"""
AgentGuard AI — Scanner Output Normalizer.
Transforms heterogeneous scanner outputs (Semgrep AST, Bandit, OSV, detect-secrets)
into the unified AgentGuard Finding format.
"""
from __future__ import annotations

import re
from typing import Any


class ScannerNormalizer:
    """Normalizes output from Semgrep, Bandit, and OSV into a standardized finding dictionary."""

    @staticmethod
    def normalize_severity(raw_severity: str) -> str:
        """Map heterogeneous severity representations to critical, high, medium, low, info, unknown."""
        s = (raw_severity or "").strip().lower()
        if s in ("error", "critical", "fatal"):
            return "critical"
        if s in ("high", "major"):
            return "high"
        if s in ("warning", "warn", "medium", "moderate"):
            return "medium"
        if s in ("low", "minor"):
            return "low"
        if s in ("info", "informational", "note", "notice"):
            return "info"
        return "unknown"

    @staticmethod
    def normalize_category(rule_id: str, title: str, scanner: str) -> str:
        """Derive standardized category from rule ID and message."""
        combined = f"{rule_id} {title}".lower()
        if scanner == "osv" or "cve-" in combined or "dependency" in combined:
            return "dependency"
        if "secret" in combined or "token" in combined or "api_key" in combined or "password" in combined:
            return "secret"
        if "sqli" in combined or "sql" in combined or "injection" in combined or "command-injection" in combined:
            return "injection"
        if "xss" in combined or "cross-site" in combined:
            return "xss"
        if "crypto" in combined or "ssl" in combined or "deserialization" in combined or "hash" in combined:
            return "crypto"
        if "cors" in combined or "header" in combined or "config" in combined or "permission" in combined:
            return "misconfiguration"
        return "vulnerability"

    @classmethod
    def normalize_semgrep(cls, semgrep_data: dict[str, Any]) -> list[dict[str, Any]]:
        """Normalize raw Semgrep JSON results."""
        findings = []
        results = semgrep_data.get("results", [])

        for item in results:
            extra = item.get("extra", {})
            metadata = extra.get("metadata", {})
            rule_id = item.get("check_id") or "semgrep.rule"
            title = extra.get("message") or rule_id
            severity = cls.normalize_severity(extra.get("severity", "medium"))
            category = cls.normalize_category(rule_id, title, "semgrep")

            cwe = metadata.get("cwe")
            if isinstance(cwe, list):
                cwe = ", ".join(cwe)

            cve = metadata.get("cve")
            if isinstance(cve, list):
                cve = ", ".join(cve)

            start = item.get("start", {})
            end = item.get("end", {})

            findings.append({
                "scanner": "semgrep",
                "category": category,
                "severity": severity,
                "rule_id": rule_id,
                "title": title[:512],
                "description": extra.get("message"),
                "file_path": item.get("path"),
                "line_start": start.get("line"),
                "line_end": end.get("line"),
                "code_snippet": extra.get("lines"),
                "cwe": str(cwe) if cwe else None,
                "cve": str(cve) if cve else None,
                "package_name": None,
                "package_version": None,
                "fixed_version": None,
                "confidence": "high",
                "raw": item,
            })

        return findings

    @classmethod
    def normalize_bandit(cls, bandit_data: dict[str, Any]) -> list[dict[str, Any]]:
        """Normalize raw Bandit JSON results."""
        findings = []
        results = bandit_data.get("results", [])

        for item in results:
            rule_id = item.get("test_id") or "bandit.rule"
            title = item.get("issue_text") or item.get("test_name") or rule_id
            severity = cls.normalize_severity(item.get("issue_severity", "medium"))
            category = cls.normalize_category(rule_id, title, "bandit")
            confidence = (item.get("issue_confidence") or "medium").lower()

            cwe_info = item.get("issue_cwe", {})
            cwe = f"CWE-{cwe_info.get('id')}" if isinstance(cwe_info, dict) and cwe_info.get("id") else None

            line_range = item.get("line_range", [])
            line_start = item.get("line_number")
            line_end = line_range[-1] if line_range else line_start

            findings.append({
                "scanner": "bandit",
                "category": category,
                "severity": severity,
                "rule_id": rule_id,
                "title": title[:512],
                "description": item.get("issue_text"),
                "file_path": item.get("filename"),
                "line_start": line_start,
                "line_end": line_end,
                "code_snippet": item.get("code"),
                "cwe": cwe,
                "cve": None,
                "package_name": None,
                "package_version": None,
                "fixed_version": None,
                "confidence": confidence,
                "raw": item,
            })

        return findings

    @classmethod
    def normalize_osv(cls, osv_data: dict[str, Any]) -> list[dict[str, Any]]:
        """Normalize raw OSV-Scanner JSON or OSV REST API responses."""
        findings = []
        results = osv_data.get("results", [])

        for result in results:
            for pkg_wrapper in result.get("packages", []):
                pkg = pkg_wrapper.get("package", {})
                pkg_name = pkg.get("name")
                pkg_version = pkg.get("version")

                for vuln in pkg_wrapper.get("vulnerabilities", []):
                    vuln_id = vuln.get("id") or "OSV-VULN"
                    title = vuln.get("summary") or vuln.get("details") or f"Vulnerability in {pkg_name}"
                    title = title.split("\n")[0][:512]

                    aliases = vuln.get("aliases", [])
                    cve = next((a for a in aliases if a.startswith("CVE-")), None)

                    # Extract fixed version if specified in ranges
                    fixed_version = None
                    for affected in vuln.get("affected", []):
                        for r in affected.get("ranges", []):
                            for event in r.get("events", []):
                                if "fixed" in event:
                                    fixed_version = event["fixed"]
                                    break

                    findings.append({
                        "scanner": "osv",
                        "category": "dependency",
                        "severity": "high",  # Default dependency severity if not CVSS scored
                        "rule_id": vuln_id,
                        "title": title,
                        "description": vuln.get("details") or vuln.get("summary"),
                        "file_path": result.get("source", {}).get("path"),
                        "line_start": None,
                        "line_end": None,
                        "code_snippet": None,
                        "cwe": None,
                        "cve": cve,
                        "package_name": pkg_name,
                        "package_version": pkg_version,
                        "fixed_version": fixed_version,
                        "confidence": "high",
                        "raw": vuln,
                    })

        return findings
