"""
Comprehensive test suite for AgentGuard AI GitHub Repository Integration and Security Analysis:
- Strict URL validation & normalization (rejecting credentials, weird schemes, ports, IP, traversal)
- Isolated workspace safety, symlink traversal guards, and secret redaction
- GitHub Service error handling (404, rate limits, timeouts)
- Repository file tree analyzer, manifest detection, exclusions, limits
- Multi-engine security scanner, finding normalization, evidence redaction
- API endpoints: validate, connect, analyze, report, cancel
"""
from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from httpx import AsyncClient

from app.security.url_validation import (
    URLValidationError,
    validate_and_normalize_github_url,
)
from app.security.workspace import (
    cleanup_workspace,
    create_isolated_workspace,
    is_safe_path,
    redact_sensitive_text,
)
from app.services.github_service import GitHubAPIError, GitHubService
from app.services.repository_analyzer import RepositoryAnalyzer
from app.services.security_scanner import SecurityScannerService
from app.services.ai_scanner_review import AIScannerReviewService


# ─────────────────────────────────────────────────────────────────────────────
# 1. URL Validation Tests
# ─────────────────────────────────────────────────────────────────────────────
class TestURLValidation:
    def test_valid_standard_url(self):
        owner, repo, normalized = validate_and_normalize_github_url("https://github.com/octocat/Hello-World")
        assert owner == "octocat"
        assert repo == "Hello-World"
        assert normalized == "https://github.com/octocat/Hello-World"

    def test_valid_url_with_git_and_slash(self):
        owner, repo, normalized = validate_and_normalize_github_url("https://github.com/torvalds/linux.git/")
        assert owner == "torvalds"
        assert repo == "linux"
        assert normalized == "https://github.com/torvalds/linux"

    def test_reject_insecure_http_scheme(self):
        with pytest.raises(URLValidationError, match="Only secure HTTPS"):
            validate_and_normalize_github_url("http://github.com/owner/repo")

    def test_reject_non_https_schemes(self):
        for scheme in ["git://github.com/a/b", "ssh://github.com/a/b", "ftp://github.com/a/b", "file:///etc/passwd"]:
            with pytest.raises(URLValidationError):
                validate_and_normalize_github_url(scheme)

    def test_reject_embedded_credentials(self):
        with pytest.raises(URLValidationError, match="embedded credentials"):
            validate_and_normalize_github_url("https://user:pass@github.com/owner/repo")

    def test_reject_unsupported_domains_and_subdomains(self):
        bad_domains = [
            "https://gitlab.com/owner/repo",
            "https://bitbucket.org/owner/repo",
            "https://github.com.attacker.com/owner/repo",
            "https://malicious-github.com/owner/repo",
            "https://192.168.1.1/owner/repo",
        ]
        for url in bad_domains:
            with pytest.raises(URLValidationError, match="Unsupported domain"):
                validate_and_normalize_github_url(url)

    def test_reject_unexpected_port(self):
        with pytest.raises(URLValidationError, match="Unexpected port"):
            validate_and_normalize_github_url("https://github.com:8443/owner/repo")

    def test_reject_missing_repo_or_owner(self):
        with pytest.raises(URLValidationError):
            validate_and_normalize_github_url("https://github.com/")
        with pytest.raises(URLValidationError):
            validate_and_normalize_github_url("https://github.com/onlyowner")

    def test_reject_path_traversal_and_malformed(self):
        with pytest.raises(URLValidationError):
            validate_and_normalize_github_url("https://github.com/owner/../repo")
        with pytest.raises(URLValidationError):
            validate_and_normalize_github_url("https://github.com/owner%00/repo")


# ─────────────────────────────────────────────────────────────────────────────
# 2. Workspace Safety and Secret Redaction Tests
# ─────────────────────────────────────────────────────────────────────────────
class TestWorkspaceAndRedaction:
    def test_secret_redaction_github_pat(self):
        raw = "Using token ghp_123456789012345678901234567890123456 for access"
        redacted = redact_sensitive_text(raw)
        assert "ghp_" not in redacted
        assert "[REDACTED_GITHUB_PAT]" in redacted

    def test_secret_redaction_fine_grained_pat(self):
        fake_fg = "github_pat_" + "A" * 82
        raw = f"git clone {fake_fg}@repo"
        redacted = redact_sensitive_text(raw)
        assert fake_fg not in redacted
        assert "[REDACTED_GITHUB_FINE_GRAINED_PAT]" in redacted

    def test_secret_redaction_nvidia_key(self):
        fake_nv = "nvapi-" + "x" * 64
        raw = f"AI_API_KEY={fake_nv}"
        redacted = redact_sensitive_text(raw)
        assert fake_nv not in redacted
        assert "[REDACTED_NVIDIA_API_KEY]" in redacted

    def test_secret_redaction_aws_keys(self):
        raw = "Found AKIAIOSFODNN7EXAMPLE in config"
        redacted = redact_sensitive_text(raw)
        assert "AKIAIOSFODNN7EXAMPLE" not in redacted
        assert "[REDACTED_AWS_KEY_ID]" in redacted

    def test_secret_redaction_private_key(self):
        raw = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----"
        redacted = redact_sensitive_text(raw)
        assert "MIIEow" not in redacted
        assert "[REDACTED_PRIVATE_KEY]" in redacted

    def test_safe_path_guards(self, tmp_path):
        base = tmp_path / "sandbox"
        base.mkdir()
        safe_child = base / "safe" / "file.txt"
        escape_attempt = base / ".." / "escape.txt"

        assert is_safe_path(base, safe_child) is True
        assert is_safe_path(base, escape_attempt) is False

    def test_create_and_cleanup_workspace(self, tmp_path):
        ws = create_isolated_workspace(str(tmp_path), "test_01")
        assert ws.exists()
        test_file = ws / "sub" / "temp.txt"
        test_file.parent.mkdir(parents=True)
        test_file.write_text("temporary content")

        cleanup_workspace(ws)
        assert not ws.exists()


# ─────────────────────────────────────────────────────────────────────────────
# 3. GitHub Service Tests (Mocked API)
# ─────────────────────────────────────────────────────────────────────────────
class TestGitHubService:
    @pytest.mark.asyncio
    async def test_get_repository_info_success(self):
        mock_response = httpx.Response(
            status_code=200,
            json={
                "owner": {"login": "octocat"},
                "name": "Hello-World",
                "full_name": "octocat/Hello-World",
                "description": "My first repo",
                "default_branch": "master",
                "private": False,
                "size": 108,
            },
            request=httpx.Request("GET", "https://api.github.com/repos/octocat/Hello-World"),
        )
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.get.return_value = mock_response

        svc = GitHubService(http_client=mock_client)
        info = await svc.get_repository_info("octocat", "Hello-World")
        assert info["full_name"] == "octocat/Hello-World"
        assert info["default_branch"] == "master"
        assert info["is_private"] is False

    @pytest.mark.asyncio
    async def test_get_repository_info_404_safe_error(self):
        mock_response = httpx.Response(
            status_code=404,
            json={"message": "Not Found"},
            request=httpx.Request("GET", "https://api.github.com/repos/private/repo"),
        )
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.get.return_value = mock_response

        svc = GitHubService(http_client=mock_client)
        with pytest.raises(GitHubAPIError) as exc_info:
            await svc.get_repository_info("private", "repo")
        assert exc_info.value.status_code == 404
        assert "could not be accessed" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_get_repository_info_rate_limit(self):
        mock_response = httpx.Response(
            status_code=403,
            headers={"x-ratelimit-remaining": "0", "x-ratelimit-reset": "1700000000"},
            json={"message": "API rate limit exceeded"},
            request=httpx.Request("GET", "https://api.github.com/repos/foo/bar"),
        )
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.get.return_value = mock_response

        svc = GitHubService(http_client=mock_client)
        with pytest.raises(GitHubAPIError) as exc_info:
            await svc.get_repository_info("foo", "bar")
        assert exc_info.value.is_rate_limit is True
        assert "rate limit exceeded" in str(exc_info.value)


# ─────────────────────────────────────────────────────────────────────────────
# 4. Tree Analyzer and Manifest Tests
# ─────────────────────────────────────────────────────────────────────────────
class TestRepositoryAnalyzer:
    def test_tree_analysis_manifests_and_exclusions(self):
        tree = [
            {"path": "package.json", "type": "blob", "size": 500},
            {"path": "requirements.txt", "type": "blob", "size": 300},
            {"path": "Cargo.toml", "type": "blob", "size": 200},
            {"path": "src/index.ts", "type": "blob", "size": 1200},
            {"path": "app/main.py", "type": "blob", "size": 2500},
            {"path": "tests", "type": "tree"},
            {"path": "tests/test_main.py", "type": "blob", "size": 800},
            {"path": ".github/workflows/ci.yml", "type": "blob", "size": 400},
            {"path": "Dockerfile", "type": "blob", "size": 350},
            # Excluded items
            {"path": "node_modules/express/index.js", "type": "blob", "size": 9999},
            {"path": ".venv/bin/python", "type": "blob", "size": 9999},
            {"path": ".git/config", "type": "blob", "size": 9999},
        ]

        meta = RepositoryAnalyzer.analyze_tree(
            tree_items=tree,
            owner="myorg",
            name="myapp",
            default_branch="main",
            pinned_sha="abcdef1234567890",
        )

        assert meta.owner == "myorg"
        assert meta.name == "myapp"
        assert meta.pinned_sha == "abcdef1234567890"
        assert "package.json" in meta.manifests
        assert "requirements.txt" in meta.manifests
        assert "Cargo.toml" in meta.manifests
        assert "Python" in meta.languages
        assert "TypeScript" in meta.languages
        assert ".py" in meta.extensions
        assert ".ts" in meta.extensions
        assert "Dockerfile" in meta.config_files
        assert ".github/workflows/ci.yml" in meta.workflow_files
        # Verify node_modules / .git was excluded
        assert meta.file_count == 8  # 8 non-excluded blob files
        assert meta.is_incomplete is False


# ─────────────────────────────────────────────────────────────────────────────
# 5. Security Scanner Service Tests
# ─────────────────────────────────────────────────────────────────────────────
class TestSecurityScanner:
    @pytest.mark.asyncio
    async def test_builtin_scanner_detects_secrets_and_vulnerabilities(self, tmp_path):
        # Create sample files with known security patterns
        src_dir = tmp_path / "src"
        src_dir.mkdir()

        # Secret file
        app_file = src_dir / "app.py"
        app_file.write_text(
            '# Config\n'
            'token = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456"\n'
            'def run(cmd):\n'
            '    return eval(cmd)\n'
        )

        # Vulnerable dependency manifest
        req_file = tmp_path / "requirements.txt"
        req_file.write_text("requests==2.20.0\n")

        scanner_svc = SecurityScannerService()
        findings, scanners_run = await scanner_svc.scan_repository(
            workspace_dir=tmp_path,
            commit_sha="test_commit_sha",
        )

        assert len(findings) >= 2
        titles = [f["title"] for f in findings]
        assert any("GitHub Personal Access Token" in t for t in titles)
        assert any("eval()" in t for t in titles)
        assert any("requests" in t.lower() for t in titles)

        # Verify evidence redaction in findings
        for f in findings:
            assert "ghp_" not in f.get("sanitized_evidence", "")


# ─────────────────────────────────────────────────────────────────────────────
# 6. End-to-End API Integration Tests
# ─────────────────────────────────────────────────────────────────────────────
class TestRepositoryAPI:
    @pytest.mark.asyncio
    async def test_validate_endpoint_valid_url(self, client: AsyncClient):
        resp = await client.post(
            "/api/repositories/validate",
            json={"url": "https://github.com/octocat/Hello-World"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is True
        assert data["owner"] == "octocat"
        assert data["name"] == "Hello-World"

    @pytest.mark.asyncio
    async def test_validate_endpoint_invalid_url(self, client: AsyncClient):
        resp = await client.post(
            "/api/repositories/validate",
            json={"url": "http://malicious-site.com/foo/bar"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is False
        assert "Invalid URL scheme" in data["error"] or "Unsupported domain" in data["error"]

    @pytest.mark.asyncio
    async def test_connect_and_analyze_repository(self, client: AsyncClient):
        # Mock GitHubService methods
        with patch.object(
            GitHubService,
            "get_repository_info",
            new_callable=AsyncMock,
            return_value={
                "owner": "octocat",
                "name": "Hello-World",
                "full_name": "octocat/Hello-World",
                "description": "Test Repo",
                "default_branch": "main",
                "is_private": False,
                "size_kb": 100,
            },
        ), patch.object(
            GitHubService,
            "get_commit_sha",
            new_callable=AsyncMock,
            return_value="1234567890abcdef1234567890abcdef12345678",
        ), patch.object(
            GitHubService,
            "get_languages",
            new_callable=AsyncMock,
            return_value={"Python": 5000, "TypeScript": 3000},
        ), patch.object(
            GitHubService,
            "get_git_tree",
            new_callable=AsyncMock,
            return_value=(
                [
                    {"path": "package.json", "type": "blob", "size": 300},
                    {"path": "src/main.ts", "type": "blob", "size": 1500},
                ],
                False,
            ),
        ):
            # 1. Connect repository
            connect_resp = await client.post(
                "/api/repositories",
                json={"url": "https://github.com/octocat/Hello-World"},
            )
            assert connect_resp.status_code == 201
            repo_data = connect_resp.json()
            repo_id = repo_data["id"]
            assert repo_data["full_name"] == "octocat/Hello-World"
            assert repo_data["pinned_sha"] == "1234567890abcdef1234567890abcdef12345678"

            # 2. Analyze repository (metadata-only)
            analyze_resp = await client.post(
                f"/api/repositories/{repo_id}/analyze",
                json={"metadata_only": True},
            )
            assert analyze_resp.status_code == 201
            scan_data = analyze_resp.json()
            scan_id = scan_data["id"]
            assert scan_data["status"] == "completed"
            assert scan_data["stage"] == "completed"

            # 3. Fetch scan report
            report_resp = await client.get(f"/api/scans/{scan_id}/report")
            assert report_resp.status_code == 200
            report_data = report_resp.json()
            assert report_data["scan_id"] == scan_id
            assert report_data["repository_full_name"] == "octocat/Hello-World"
            assert "summary" in report_data
            assert "findings" in report_data

            # 4. Cancel scan (completed scan should remain completed)
            cancel_resp = await client.post(f"/api/scans/{scan_id}/cancel")
            assert cancel_resp.status_code == 200
            assert cancel_resp.json()["status"] == "completed"

    @pytest.mark.asyncio
    async def test_ai_status_when_credentials_not_configured(self):
        service = AIScannerReviewService()
        review = await service.review_findings(findings=[], repo_metadata={"name": "test-repo"})
        assert review["status"] in ["completed", "not_configured"]
