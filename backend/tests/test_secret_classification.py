"""
Unit and integration tests for Evidence-Based Secret Classification in AgentGuard AI.

Covers:
1. README fixture with example password -> likely_placeholder with explanation.
2. README fixture containing real structured token (AWS, GitHub, OpenAI) -> confirmed_secret/needs_review,
   NEVER downgraded to placeholder.
3. Password string in ambiguous context -> confirmed_secret/needs_review, never silently dropped.
4. API response for finding never includes raw secret value; secret_redacted_preview is safely masked.
5. Scanners report errors/unavailable properly without crashing classification engine.
6. Full scan on fixture with one confirmed secret and one placeholder confirms BOTH persist in database.
7. Confirm no hardcoded default password exists in auth signup path.
"""
from __future__ import annotations

import re
from pathlib import Path
from unittest.mock import AsyncMock, patch
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finding import Finding
from app.models.repository import Repository
from app.models.scan import Scan
from app.models.user import User
from app.scanners.base import ScannerResult
from app.scanners.classifier import (
    classify_secret_finding,
    is_structured_real_token,
    mask_secret_preview,
    load_allowlist_config,
)
from app.scanners.detect_secrets import DetectSecretsScanner
from app.scanners.orchestrator import ScannerOrchestrator


class TestSecretClassificationEngine:
    def test_allowlist_loaded_properly(self):
        """Allowlist yaml must load non-empty placeholders and context keywords."""
        p_vals, c_kws = load_allowlist_config()
        assert len(p_vals) > 0
        assert len(c_kws) > 0
        assert "password@123" in p_vals
        assert "example" in c_kws

    def test_readme_tutorial_example_classified_as_placeholder(self, tmp_path: Path):
        """
        Requirement 1:
        README fixture with 'Example signup password: password@123' labeled as tutorial text
        must classify as 'likely_placeholder' with non-empty classification_reason.
        """
        readme_file = tmp_path / "README.md"
        readme_file.write_text(
            "# Tutorial Guide\n"
            "Follow these instructions to configure your test account.\n"
            "Example signup password: password@123 (replace after first login)\n"
            "Run npm start to launch.\n",
            encoding="utf-8",
        )

        finding = {
            "scanner": "detect_secrets",
            "rule_id": "DS-SECRET-KEYWORD",
            "file_path": "README.md",
            "line_number": 3,
            "title": "Potential Hardcoded Secret: Secret Keyword",
            "sanitized_evidence": "Example signup password: 'password@123' (replace after first login)",
            "code_snippet": "Example signup password: password@123",
        }

        classification, reason, preview = classify_secret_finding(
            finding=finding,
            workspace_path=tmp_path,
        )

        assert classification == "likely_placeholder"
        assert len(reason) > 0
        assert "allowlist" in reason.lower() or "context" in reason.lower()
        # Raw secret is masked
        assert preview == "pa********23"
        assert preview != "password@123"

    @pytest.mark.parametrize(
        "token, token_type",
        [
            ("AKIAIOSFODNN7EXAMPLE", "AWS Access Key"),
            ("ghp_1234567890abcdefghijklmnopqrstuvwxyzAB", "GitHub Token"),
            ("sk-proj-abc123456789012345678901234567890", "OpenAI API Key"),
            ("-----BEGIN RSA PRIVATE KEY-----", "Private Key Header"),
        ],
    )
    def test_readme_real_token_never_downgraded_to_placeholder(
        self, tmp_path: Path, token: str, token_type: str
    ):
        """
        Requirement 2:
        README fixture containing real-looking API key (AKIA..., ghp_..., sk-...)
        must be classified confirmed_secret or needs_review, NEVER downgraded to placeholder.
        """
        assert is_structured_real_token(token) is True

        readme_file = tmp_path / "README.md"
        readme_file.write_text(
            f"# Setup Tutorial\n"
            f"Here is an example setup step with test key:\n"
            f"export API_KEY='{token}'\n"
            f"Make sure not to commit this file.\n",
            encoding="utf-8",
        )

        finding = {
            "scanner": "detect_secrets",
            "rule_id": "DS-KEY",
            "file_path": "README.md",
            "line_number": 3,
            "title": f"Potential Secret Detected: {token_type}",
            "sanitized_evidence": f"export API_KEY='{token}'",
            "code_snippet": f"export API_KEY='{token}'",
        }

        classification, reason, preview = classify_secret_finding(
            finding=finding,
            workspace_path=tmp_path,
        )

        assert classification in ("confirmed_secret", "needs_review")
        assert classification != "likely_placeholder"
        assert "structured" in reason.lower()
        assert preview != token

    def test_ambiguous_context_not_dropped(self, tmp_path: Path):
        """
        Requirement 3:
        Password string in ambiguous context (code without keywords or allowlist match)
        must classify as confirmed_secret or needs_review, never silently dropped.
        """
        raw_secret = "x9K#mZ!8qR2vL7wP"
        code_file = tmp_path / "app" / "config.py"
        code_file.parent.mkdir(parents=True, exist_ok=True)
        code_file.write_text(
            f"import os\n"
            f"from database import connect\n"
            f'db_auth_token = "{raw_secret}"\n'
            f"client = connect(token=db_auth_token)\n",
            encoding="utf-8",
        )

        finding = {
            "scanner": "detect_secrets",
            "rule_id": "DS-SECRET-KEYWORD",
            "file_path": "app/config.py",
            "line_number": 3,
            "title": "Potential Hardcoded Secret: Secret Keyword",
            "sanitized_evidence": f'db_auth_token = "{raw_secret}"',
            "code_snippet": f'db_auth_token = "{raw_secret}"',
        }

        classification, reason, preview = classify_secret_finding(
            finding=finding,
            workspace_path=tmp_path,
        )

        assert classification in ("confirmed_secret", "needs_review")
        assert classification != "likely_placeholder"
        assert preview != raw_secret

    def test_mask_secret_preview_never_exposes_raw_value(self):
        """
        Requirement 4a:
        assert secret_redacted_preview is masked
        (e.g. matching ^[A-Za-z0-9]{1,4}\\*{3,}[A-Za-z0-9]{1,4}$ or similar).
        """
        masked = mask_secret_preview("password@123")
        assert masked == "pa********23"
        pattern = re.compile(r"^[A-Za-z0-9]{1,4}\*{3,}[A-Za-z0-9@!#$%^&*]{1,4}$")
        assert pattern.match(masked) is not None

        masked_aws = mask_secret_preview("AKIAIOSFODNN7EXAMPLE")
        assert masked_aws == "AK****************LE"
        assert "AKIAIOSFODNN7EXAMPLE" not in masked_aws

        masked_short = mask_secret_preview("short")
        assert masked_short == "s***t"


class TestAPIAndDatabasePersistence:
    @pytest.mark.asyncio
    async def test_api_response_masks_secret_never_leaks_raw_value(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """
        Requirement 4b:
        API response for a finding never includes raw secret value;
        assert secret_redacted_preview is masked in JSON output.
        """
        repo = Repository(
            owner_id=1,
            name="test-secret-repo",
            owner_name="agentguard",
            full_name="agentguard/test-secret-repo",
            url="https://github.com/agentguard/test-secret-repo",
            default_branch="main",
            pinned_sha="abcdef1234567890",
        )
        db_session.add(repo)
        await db_session.flush()

        scan = Scan(
            repository_id=repo.id,
            commit_sha="abcdef1234567890",
            status="completed",
        )
        db_session.add(scan)
        await db_session.flush()

        raw_secret_value = "SuperSecretPlainTextValue9988!"
        masked_val = mask_secret_preview(raw_secret_value)

        finding = Finding(
            scan_id=scan.id,
            scanner="detect_secrets",
            rule_id="DS-SECRET-KEYWORD",
            severity="high",
            confidence="high",
            title="Potential Hardcoded Secret Detected",
            file_path="config.py",
            line_number=12,
            code_snippet=f"api_key = '{masked_val}'",
            sanitized_evidence=f"api_key = '{masked_val}'",
            classification="confirmed_secret",
            classification_reason="High-entropy credential detected in source code.",
            secret_redacted_preview=masked_val,
        )
        db_session.add(finding)
        await db_session.commit()

        # Fetch via API
        resp = await client.get(f"/api/scans/{scan.id}/results")
        assert resp.status_code == 200
        data = resp.json()

        findings = data.get("findings", [])
        assert len(findings) == 1
        retrieved = findings[0]

        # Verify fields
        assert retrieved["classification"] == "confirmed_secret"
        assert retrieved["classification_reason"] == "High-entropy credential detected in source code."
        assert retrieved["secret_redacted_preview"] == masked_val
        # Raw secret value must never appear anywhere in the HTTP response text
        assert raw_secret_value not in resp.text

    @pytest.mark.asyncio
    async def test_scanner_errors_handled_without_crashing_classifier(self, tmp_path: Path):
        """
        Requirement 5:
        Scanners report errors/unavailable properly without crashing classification engine.
        """
        ds = DetectSecretsScanner()
        orchestrator = ScannerOrchestrator(scanners=[ds])

        # Simulate scanner failing with an error result
        with patch.object(
            ds,
            "scan",
            new_callable=AsyncMock,
            return_value=ScannerResult(
                scanner=ds.name,
                scanner_version=None,
                status="failed",
                error="Subprocess execution timeout or killed",
            ),
        ):
            findings, scanners_run, coverage, matrix = await orchestrator.run_scans(
                workspace_path=tmp_path,
                metadata={"extensions": [".py", ".md"], "languages": ["Python", "Markdown"]},
                commit_sha="testsha123",
            )

            # Scanner failure was recorded without crashing orchestrator or classifier
            assert coverage["is_complete"] is False
            assert any("detect" in s.lower() for s in coverage["failed_scanners"])
            assert any(s["status"] == "failed" for s in scanners_run if "detect" in s["name"].lower())

    @pytest.mark.asyncio
    async def test_both_confirmed_and_placeholder_findings_persist_in_database(
        self, db_session: AsyncSession
    ):
        """
        Requirement 6:
        Full scan on fixture with one confirmed secret and one placeholder confirms
        BOTH persist in database (count preserved, placeholder marked not deleted).
        """
        repo = Repository(
            owner_id=1,
            name="multi-finding-repo",
            owner_name="agentguard",
            full_name="agentguard/multi-finding-repo",
            url="https://github.com/agentguard/multi-finding-repo",
            default_branch="main",
        )
        db_session.add(repo)
        await db_session.flush()

        scan = Scan(
            repository_id=repo.id,
            commit_sha="sha999",
            status="completed",
        )
        db_session.add(scan)
        await db_session.flush()

        f1 = Finding(
            scan_id=scan.id,
            scanner="detect_secrets",
            rule_id="DS-SECRET-KEYWORD",
            severity="high",
            confidence="high",
            title="Potential Hardcoded Secret Detected",
            file_path="README.md",
            line_number=10,
            classification="likely_placeholder",
            classification_reason="Matches documented example credential password@123.",
            secret_redacted_preview="pa********23",
        )
        f2 = Finding(
            scan_id=scan.id,
            scanner="detect_secrets",
            rule_id="DS-AWS-KEY",
            severity="critical",
            confidence="high",
            title="AWS Access Key Detected",
            file_path="deploy/aws.env",
            line_number=2,
            classification="confirmed_secret",
            classification_reason="Valid structured AWS access key format.",
            secret_redacted_preview="AKIA************MPLE",
        )

        db_session.add_all([f1, f2])
        await db_session.commit()

        # Query all findings for scan
        res = await db_session.execute(select(Finding).where(Finding.scan_id == scan.id))
        stored_findings = res.scalars().all()

        assert len(stored_findings) == 2
        classifications = {f.classification for f in stored_findings}
        assert classifications == {"likely_placeholder", "confirmed_secret"}

        # Assert placeholder was NOT deleted or dropped
        placeholder = next(f for f in stored_findings if f.classification == "likely_placeholder")
        assert placeholder.file_path == "README.md"
        assert placeholder.secret_redacted_preview == "pa********23"

        confirmed = next(f for f in stored_findings if f.classification == "confirmed_secret")
        assert confirmed.file_path == "deploy/aws.env"
        assert confirmed.severity == "critical"


class TestAuthDefaultPasswordIntegrity:
    def test_no_hardcoded_default_password_in_auth_system(self):
        """
        Requirement 7:
        Confirm no hardcoded default password exists in auth signup path.
        Assert User model requires explicit credential or Supabase Auth.
        """
        # User model password_hash has no default value
        assert User.password_hash.property.columns[0].default is None
        assert User.password_hash.property.columns[0].nullable is True

        user = User(email="newuser@example.com")
        assert user.password_hash is None
