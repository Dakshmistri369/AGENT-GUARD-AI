"""
Comprehensive test suite for AgentGuard AI Solutions Service and Endpoints:
- OSV Dependency upgrade solutions (npm, pip) & manifest diffs
- Bandit AST security diffs (B110, B112, B404/B603/B607, B101, B324, B506)
- Detect-Secrets secret extraction to .env and env var diffs
- Repository-wide fix plan aggregation & unified git apply patch generation
- API endpoints: /api/scans/{id}/solutions, /api/scans/{id}/solutions/patch, /api/findings/{id}/solution, /api/findings/{id}/solution/ai-enhance
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finding import Finding
from app.models.repository import Repository
from app.models.scan import Scan
from app.services.solution_service import SolutionService


class TestSolutionHeuristics:
    def test_osv_npm_dependency_solution(self):
        finding = Finding(
            id=101,
            scan_id=1,
            scanner="osv_scanner",
            rule_id="GHSA-g2v6-rqmx-r4w6",
            title="@vue/server-renderer@3.5.39: GHSA-g2v6-rqmx-r4w6",
            severity="high",
            confidence="high",
            file_path="package-lock.json",
            sanitized_evidence="@vue/server-renderer@3.5.39 is vulnerable to XSS in SSR",
        )
        sol = SolutionService.generate_solution_for_finding(finding)
        assert sol.solution_type == "dependency_upgrade"
        assert "@vue/server-renderer" in sol.cli_command
        assert sol.cli_command.startswith("npm install")
        assert sol.diff is not None
        assert "package.json" in sol.file_path
        assert "npm audit" in sol.verification_step

    def test_osv_pypi_dependency_solution(self):
        finding = Finding(
            id=102,
            scan_id=1,
            scanner="osv_scanner",
            rule_id="CVE-2023-45857",
            title="requests@2.25.0: CVE-2023-45857",
            severity="critical",
            confidence="high",
            file_path="requirements.txt",
            sanitized_evidence="requests==2.25.0 vulnerable to credential leakage",
        )
        sol = SolutionService.generate_solution_for_finding(finding)
        assert sol.solution_type == "dependency_upgrade"
        assert "pip install --upgrade requests" in sol.cli_command
        assert "requirements.txt" in sol.file_path

    def test_detect_secrets_solution(self):
        finding = Finding(
            id=103,
            scan_id=1,
            scanner="detect_secrets",
            rule_id="DS-SECRET-KEYWORD",
            title="Potential Hardcoded Secret: Secret Keyword",
            severity="high",
            confidence="high",
            file_path="src/config.py",
            line_number=42,
            sanitized_evidence='API_SECRET_KEY = "sk_live_1234567890abcdef"',
        )
        sol = SolutionService.generate_solution_for_finding(finding)
        assert sol.solution_type == "secret_removal"
        assert ".env" in sol.cli_command
        assert ".gitignore" in sol.cli_command
        assert "os.getenv" in sol.after_code
        assert sol.diff is not None
        assert "detect-secrets" in sol.verification_step

    def test_bandit_b110_try_except_pass(self):
        finding = Finding(
            id=104,
            scan_id=1,
            scanner="bandit",
            rule_id="B110",
            title="Try, Except, Pass detected.",
            severity="low",
            confidence="high",
            file_path="services/data_fetcher.py",
            line_number=75,
            sanitized_evidence="except Exception:\n    pass",
        )
        sol = SolutionService.generate_solution_for_finding(finding)
        assert sol.solution_type == "code_diff"
        assert "logger" in sol.after_code
        assert "bandit -r" in sol.cli_command
        assert sol.diff is not None
        assert "silent" in sol.explanation.lower() or "suppression" in sol.explanation.lower()

    def test_bandit_b404_subprocess_security(self):
        finding = Finding(
            id=105,
            scan_id=1,
            scanner="bandit",
            rule_id="B607",
            title="Starting a process with a partial executable path",
            severity="medium",
            confidence="high",
            file_path="utils/exec_helper.py",
            line_number=12,
            sanitized_evidence="subprocess.Popen(['ffmpeg', '-i', 'in.mp3'])",
        )
        sol = SolutionService.generate_solution_for_finding(finding)
        assert sol.solution_type == "code_diff"
        assert "shutil.which" in sol.after_code
        assert "shell=False" in sol.after_code
        assert sol.diff is not None

    def test_bandit_b101_assert_used(self):
        finding = Finding(
            id=106,
            scan_id=1,
            scanner="bandit",
            rule_id="B101",
            title="Use of assert detected.",
            severity="low",
            confidence="high",
            file_path="auth/guards.py",
            line_number=20,
            sanitized_evidence="assert user.is_admin, 'Admin required'",
        )
        sol = SolutionService.generate_solution_for_finding(finding)
        assert sol.solution_type == "code_diff"
        assert "raise" in sol.after_code
        assert "-O" in sol.explanation


class TestRepositoryFixPlan:
    def test_consolidated_fix_plan_generation(self):
        findings = [
            Finding(
                id=1,
                scan_id=5,
                scanner="osv_scanner",
                rule_id="GHSA-1",
                title="axios@0.21.1: SSRF",
                severity="high",
                confidence="high",
                file_path="package.json",
                sanitized_evidence="axios@0.21.1",
            ),
            Finding(
                id=2,
                scan_id=5,
                scanner="osv_scanner",
                rule_id="GHSA-2",
                title="lodash@4.17.15: Prototype Pollution",
                severity="critical",
                confidence="high",
                file_path="package.json",
                sanitized_evidence="lodash@4.17.15",
            ),
            Finding(
                id=3,
                scan_id=5,
                scanner="bandit",
                rule_id="B110",
                title="Try, Except, Pass detected.",
                severity="low",
                confidence="high",
                file_path="main.py",
                line_number=10,
                sanitized_evidence="try:\n    pass\nexcept Exception:\n    pass",
            ),
            Finding(
                id=4,
                scan_id=5,
                scanner="detect_secrets",
                rule_id="DS-SECRET-KEYWORD",
                title="Hardcoded API Secret",
                severity="high",
                confidence="high",
                file_path="main.py",
                line_number=3,
                sanitized_evidence='API_TOKEN = "xyz12345"',
            ),
        ]

        plan = SolutionService.generate_repository_solution_plan(
            scan_id=5,
            repository_id=2,
            findings=findings,
        )

        assert plan.total_solutions == 4
        assert plan.dependency_upgrades_count == 2
        assert plan.code_diffs_count == 1
        assert plan.secret_removals_count == 1

        # Check aggregated npm install command
        npm_cmd = next((c for c in plan.quick_fix_cli_commands if c.startswith("npm install")), None)
        assert npm_cmd is not None
        assert "axios@latest" in npm_cmd
        assert "lodash@latest" in npm_cmd

        # Check grouped files
        assert len(plan.file_groups) == 2  # package.json and main.py
        file_paths = {g.file_path for g in plan.file_groups}
        assert "package.json" in file_paths
        assert "main.py" in file_paths

        # Check unified patch
        assert plan.full_unified_patch is not None
        assert "--- a/package.json" in plan.full_unified_patch
        assert "--- a/main.py" in plan.full_unified_patch


class TestSolutionsAPI:
    @pytest.mark.asyncio
    async def test_get_scan_solutions_and_patch(self, client: AsyncClient, db_session: AsyncSession):
        # 1. Create repo and scan in db
        repo = Repository(
            owner_id=1,
            name="demo-solutions-repo",
            owner_name="demo-user",
            full_name="demo-user/demo-solutions-repo",
            url="https://github.com/demo-user/demo-solutions-repo",
            default_branch="main",
            pinned_sha="abcdef1234567890abcdef1234567890abcdef12",
        )
        db_session.add(repo)
        await db_session.commit()
        await db_session.refresh(repo)

        scan = Scan(
            repository_id=repo.id,
            status="completed",
            stage="completed",
            commit_sha=repo.pinned_sha,
        )
        db_session.add(scan)
        await db_session.commit()
        await db_session.refresh(scan)

        f1 = Finding(
            scan_id=scan.id,
            scanner="bandit",
            rule_id="B110",
            title="Try, Except, Pass detected.",
            severity="low",
            confidence="high",
            file_path="app.py",
            line_number=22,
            sanitized_evidence="except Exception:\n    pass",
        )
        f2 = Finding(
            scan_id=scan.id,
            scanner="detect_secrets",
            rule_id="DS-SECRET-KEYWORD",
            title="Potential Hardcoded Secret",
            severity="high",
            confidence="high",
            file_path="app.py",
            line_number=5,
            sanitized_evidence='JWT_KEY = "my_super_secret"',
        )
        db_session.add_all([f1, f2])
        await db_session.commit()
        await db_session.refresh(f1)
        await db_session.refresh(f2)

        # Test GET /api/scans/{scan.id}/solutions
        resp = await client.get(f"/api/scans/{scan.id}/solutions")
        assert resp.status_code == 200
        data = resp.json()
        assert data["scan_id"] == scan.id
        assert data["total_solutions"] == 2
        assert len(data["solutions"]) == 2
        assert len(data["file_groups"]) == 1
        assert data["file_groups"][0]["file_path"] == "app.py"

        # Test GET /api/scans/{scan.id}/solutions/patch
        patch_resp = await client.get(f"/api/scans/{scan.id}/solutions/patch")
        assert patch_resp.status_code == 200
        assert "--- a/app.py" in patch_resp.text
        assert "+++ b/app.py" in patch_resp.text
        assert "attachment" in patch_resp.headers["Content-Disposition"]

        # Test GET /api/findings/{finding_id}/solution
        single_resp = await client.get(f"/api/findings/{f1.id}/solution")
        assert single_resp.status_code == 200
        sol_data = single_resp.json()
        assert sol_data["finding_id"] == f1.id
        assert sol_data["solution_type"] == "code_diff"
        assert sol_data["diff"] is not None

        # Test POST /api/findings/{finding_id}/solution/ai-enhance
        ai_resp = await client.post(f"/api/findings/{f1.id}/solution/ai-enhance")
        assert ai_resp.status_code == 200
        ai_data = ai_resp.json()
        assert ai_data["finding_id"] == f1.id
        assert ai_data["explanation"] != ""

        # Test 404 for non-existent scan and finding
        not_found_scan = await client.get("/api/scans/999999/solutions")
        assert not_found_scan.status_code == 404

        not_found_finding = await client.get("/api/findings/999999/solution")
        assert not_found_finding.status_code == 404
