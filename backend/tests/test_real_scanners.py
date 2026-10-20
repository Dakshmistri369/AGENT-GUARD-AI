"""
Comprehensive automated tests for AgentGuard AI Real Security Scanning:
- Semgrep, Bandit, OSV-Scanner, and detect-secrets scanner services
- Project type detection and scanner applicability
- Scanner availability checks & coverage reporting
- JSON output normalization into common finding schema
- Timeouts, output limits, and secret evidence redaction
"""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch
import pytest

from app.scanners.bandit import BanditScanner
from app.scanners.detect_secrets import DetectSecretsScanner
from app.scanners.orchestrator import ScannerOrchestrator
from app.scanners.osv import OSVScanner
from app.scanners.semgrep import SemgrepScanner


class TestProjectTypeAndApplicability:
    def test_bandit_applicability(self):
        scanner = BanditScanner()
        # Applicable for Python
        app, reason = scanner.is_applicable({"extensions": [".py", ".md"], "languages": ["Python"]})
        assert app is True
        assert "Python" in reason

        # Not applicable for pure JS
        app_js, reason_js = scanner.is_applicable({"extensions": [".ts", ".json"], "languages": ["TypeScript"]})
        assert app_js is False
        assert "No Python" in reason_js

    def test_semgrep_applicability(self):
        scanner = SemgrepScanner()
        # Applicable for JS/TS/Python/Go/Rust
        app_ts, _ = scanner.is_applicable({"extensions": [".tsx", ".css"], "languages": ["TypeScript"]})
        assert app_ts is True

        # Not applicable for only markdown/plain text
        app_none, _ = scanner.is_applicable({"extensions": [".txt", ".md"], "languages": ["Markdown"]})
        assert app_none is False

    def test_osv_scanner_applicability(self):
        scanner = OSVScanner()
        # Applicable when manifests exist
        app_m, reason_m = scanner.is_applicable({"manifests": ["package.json", "package-lock.json"]})
        assert app_m is True
        assert "manifests detected" in reason_m

        # Not applicable when no lockfiles/manifests
        app_no, _ = scanner.is_applicable({"manifests": [], "extensions": [".c"]})
        assert app_no is False

    def test_detect_secrets_universally_applicable(self):
        scanner = DetectSecretsScanner()
        app, _ = scanner.is_applicable({"extensions": [".rs"]})
        assert app is True


class TestScannerOutputParsers:
    @pytest.mark.asyncio
    async def test_bandit_parser_normalizes_findings(self, tmp_path):
        scanner = BanditScanner()
        mock_bandit_json = json.dumps({
            "results": [
                {
                    "test_id": "B608",
                    "issue_text": "Possible SQL injection vector through string-based query construction",
                    "issue_severity": "HIGH",
                    "issue_confidence": "MEDIUM",
                    "filename": str(tmp_path / "app" / "db.py"),
                    "line_number": 42,
                    "col_offset": 5,
                    "code": "cursor.execute(f'SELECT * FROM users WHERE id = {user_id}')",
                    "more_info": "https://bandit.readthedocs.io/en/latest/plugins/b608_hardcoded_sql_expressions.html",
                }
            ]
        })

        with patch.object(scanner, "is_available", return_value=(True, "1.8.5")), \
             patch.object(scanner, "execute_cmd", new_callable=AsyncMock, return_value=(1, mock_bandit_json, "")):
            result = await scanner.scan(
                workspace_path=tmp_path,
                metadata={"extensions": [".py"], "languages": ["Python"]},
                commit_sha="sha123",
            )

            assert result.status == "completed"
            assert len(result.findings) == 1
            f = result.findings[0]
            assert f["scanner"] == "bandit"
            assert f["rule_id"] == "B608"
            assert f["severity"] == "high"
            assert f["confidence"] == "medium"
            assert f["line_number"] == 42
            assert "SELECT" in f["sanitized_evidence"]
            assert f["commit_sha"] == "sha123"

    @pytest.mark.asyncio
    async def test_semgrep_parser_normalizes_findings(self, tmp_path):
        scanner = SemgrepScanner()
        mock_semgrep_json = json.dumps({
            "results": [
                {
                    "check_id": "javascript.express.security.audit.xss.direct-response-write",
                    "path": str(tmp_path / "server.js"),
                    "start": {"line": 15, "col": 3},
                    "extra": {
                        "message": "Direct response write may cause Cross-Site Scripting (XSS)",
                        "severity": "ERROR",
                        "lines": "res.send('<h1>Hello ' + req.query.name + '</h1>');",
                        "metadata": {
                            "security-severity": "8.5",
                            "fix": "Sanitize user input or use a template engine.",
                        },
                    },
                }
            ]
        })

        with patch.object(scanner, "is_available", return_value=(True, "1.180.0")), \
             patch.object(scanner, "execute_cmd", new_callable=AsyncMock, return_value=(1, mock_semgrep_json, "")):
            result = await scanner.scan(
                workspace_path=tmp_path,
                metadata={"extensions": [".js"], "languages": ["JavaScript"]},
                commit_sha="sha456",
            )

            assert result.status == "completed"
            assert len(result.findings) == 1
            f = result.findings[0]
            assert f["scanner"] == "semgrep"
            assert f["rule_id"] == "javascript.express.security.audit.xss.direct-response-write"
            assert f["severity"] == "high"
            assert f["line_number"] == 15
            assert f["column_number"] == 3
            assert "XSS" in f["explanation"]

    @pytest.mark.asyncio
    async def test_detect_secrets_parser_and_redaction(self, tmp_path):
        scanner = DetectSecretsScanner()
        # Create a mock file in tmp_path
        target_file = tmp_path / "config.json"
        target_file.write_text('{"api_key": "ghp_SECRETTOKENHERE1234567890123456"}')

        mock_ds_json = json.dumps({
            "results": {
                str(target_file): [
                    {
                        "type": "GitHub Token",
                        "line_number": 1,
                        "hashed_secret": "abcdef12345",
                    }
                ]
            }
        })

        with patch.object(scanner, "is_available", return_value=(True, "1.5.0")), \
             patch.object(scanner, "execute_cmd", new_callable=AsyncMock, return_value=(0, mock_ds_json, "")):
            result = await scanner.scan(
                workspace_path=tmp_path,
                metadata={"extensions": [".json"]},
                commit_sha="sha789",
            )

            assert result.status == "completed"
            assert len(result.findings) == 1
            f = result.findings[0]
            assert f["scanner"] == "detect_secrets"
            assert f["severity"] == "critical"
            # Evidence must be sanitized
            assert "ghp_" not in f["sanitized_evidence"]
            assert "[REDACTED_GITHUB_PAT]" in f["sanitized_evidence"]

    @pytest.mark.asyncio
    async def test_osv_scanner_fallback_when_cli_unavailable(self, tmp_path):
        scanner = OSVScanner()
        # Create a manifest with vulnerable dependency
        req_file = tmp_path / "requirements.txt"
        req_file.write_text("requests==2.20.0\n")

        with patch.object(scanner, "is_available", return_value=(False, None)):
            result = await scanner.scan(
                workspace_path=tmp_path,
                metadata={"manifests": ["requirements.txt"]},
                commit_sha="sha999",
            )

            assert result.status == "skipped_unavailable"
            assert len(result.findings) >= 1
            f = result.findings[0]
            assert f["scanner"] == "osv_scanner"
            assert "GHSA" in f["rule_id"]


class TestScannerOrchestratorCoverage:
    @pytest.mark.asyncio
    async def test_orchestrator_selective_execution(self, tmp_path):
        orchestrator = ScannerOrchestrator()
        # Python project metadata
        metadata = {
            "extensions": [".py"],
            "languages": ["Python"],
            "manifests": ["requirements.txt"],
        }

        # Mock scanners
        with patch.object(BanditScanner, "is_available", return_value=(True, "1.8.5")), \
             patch.object(SemgrepScanner, "is_available", return_value=(True, "1.180.0")), \
             patch.object(OSVScanner, "is_available", return_value=(False, None)), \
             patch.object(DetectSecretsScanner, "is_available", return_value=(True, "1.5.0")), \
             patch.object(BanditScanner, "execute_cmd", new_callable=AsyncMock, return_value=(0, '{"results": []}', "")), \
             patch.object(SemgrepScanner, "execute_cmd", new_callable=AsyncMock, return_value=(0, '{"results": []}', "")), \
             patch.object(DetectSecretsScanner, "execute_cmd", new_callable=AsyncMock, return_value=(0, '{"results": {}}', "")):

            findings, scanners_run, coverage, matrix = await orchestrator.run_scans(
                workspace_path=tmp_path,
                metadata=metadata,
                commit_sha="sha_test",
            )

            # OSV was applicable (manifest present) but unavailable -> coverage incomplete
            assert coverage["is_complete"] is False
            assert "OSV-Scanner" in coverage["missing_scanners"]
            assert len(coverage["executed_scanners"]) >= 3  # Bandit, Semgrep, detect-secrets
            assert "bandit" in matrix
            assert "semgrep" in matrix
            assert "osv_scanner" in matrix
            assert "detect_secrets" in matrix

    @pytest.mark.asyncio
    async def test_scanner_timeout_handling(self, tmp_path):
        scanner = BanditScanner()
        with patch.object(scanner, "is_available", return_value=(True, "1.8.5")), \
             patch.object(scanner, "execute_cmd", side_effect=TimeoutError("Bandit timed out after 5s")):
            result = await scanner.scan(
                workspace_path=tmp_path,
                metadata={"extensions": [".py"], "languages": ["Python"]},
                timeout_seconds=5,
            )

            assert result.status == "timed_out"
            assert "timed out" in result.error


class TestOSVApiIntegration:
    @pytest.mark.asyncio
    async def test_query_osv_api_by_commit_hash(self):
        from app.scanners.osv import query_osv_api, osv_vuln_to_finding

        mock_vulns = [
            {
                "id": "CVE-2023-25193",
                "summary": "harfbuzz lookup buffer overflow",
                "details": "A vulnerability was found in harfbuzz.",
                "severity": [{"type": "CVSS_V3", "score": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H"}],
                "references": [{"type": "FIX", "url": "https://github.com/harfbuzz/harfbuzz/commit/85be8779"}]
            }
        ]

        from unittest.mock import MagicMock
        with patch("httpx.AsyncClient.post") as mock_post:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {"vulns": mock_vulns}
            mock_post.return_value = mock_resp

            vulns = await query_osv_api({"commit": "6879efc2c1596d11a6a6ad296f80063b558d5e0f"})
            assert len(vulns) == 1
            assert vulns[0]["id"] == "CVE-2023-25193"

            finding = osv_vuln_to_finding(vulns[0], commit_sha="6879efc2c1596d11a6a6ad296f80063b558d5e0f")
            assert finding["scanner"] == "osv_scanner"
            assert finding["rule_id"] == "CVE-2023-25193"
            assert finding["severity"] in ["high", "critical"]
            assert "Fix commit" in finding["remediation"]

    @pytest.mark.asyncio
    async def test_osv_query_endpoint(self, client):
        mock_vulns = [
            {
                "id": "OSV-2020-484",
                "summary": "Heap buffer overflow in harfbuzz",
                "details": "Details on heap buffer overflow",
            }
        ]
        with patch("app.scanners.osv.query_osv_api", new_callable=AsyncMock, return_value=mock_vulns):
            resp = await client.post(
                "/api/scans/osv/query",
                json={"commit": "6879efc2c1596d11a6a6ad296f80063b558d5e0f"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "success"
            assert data["api_key_required"] is False
            assert data["total_vulnerabilities"] == 1
            assert len(data["normalized_findings"]) == 1
            assert data["normalized_findings"][0]["rule_id"] == "OSV-2020-484"

    @pytest.mark.asyncio
    async def test_osv_scanner_v2_execution(self, tmp_path):
        scanner = OSVScanner()
        mock_output = json.dumps({
            "results": [
                {
                    "source": {"path": str(tmp_path / "requirements.txt")},
                    "packages": [
                        {
                            "package": {"name": "requests", "version": "2.25.0"},
                            "vulnerabilities": [
                                {
                                    "id": "GHSA-j8r2-6x86-q33q",
                                    "details": "Proxy-Authorization header leak",
                                    "database_specific": {"severity": "HIGH"},
                                }
                            ]
                        }
                    ]
                }
            ]
        })
        with patch.object(scanner, "is_available", return_value=(True, "2.6.0")), \
             patch("app.scanners.osv.find_scanner_executable", return_value="osv-scanner.exe"), \
             patch.object(scanner, "execute_cmd", new_callable=AsyncMock, return_value=(1, mock_output, "")) as mock_exec:
            res = await scanner.scan(
                workspace_path=tmp_path,
                metadata={"manifests": ["requirements.txt"]},
            )
            assert res.status == "completed"
            assert res.scanner_version == "2.6.0"
            assert len(res.findings) == 1
            assert res.findings[0]["rule_id"] == "GHSA-j8r2-6x86-q33q"
            # Verify v2 command syntax was used
            call_cmd = mock_exec.call_args[1]["cmd"] if "cmd" in mock_exec.call_args[1] else mock_exec.call_args[0][0]
            assert "scan" in call_cmd
            assert "source" in call_cmd
            assert "--format" in call_cmd

