"""
AgentGuard AI — Report Generation Service.
Aggregates scan metadata, scanner execution results, normalized findings,
and optional AI analysis into a structured, downloadable JSON report.
"""
from __future__ import annotations

import datetime
from typing import Any

from app.models.finding import Finding
from app.models.repository import Repository
from app.models.scan import Scan
from app.schemas.finding import FindingResponse
from app.schemas.scan import ScanReportResponse, ScanSummaryResponse


class ReportService:
    @staticmethod
    def generate_report(
        scan: Scan,
        repository: Repository,
        findings: list[Finding],
    ) -> ScanReportResponse:
        """Construct a full evidence-based report model for a scan."""
        critical_count = 0
        high_count = 0
        medium_count = 0
        low_count = 0
        info_count = 0
        scanner_breakdown: dict[str, int] = {}

        finding_responses: list[FindingResponse] = []
        for f in findings:
            sev = (f.severity or "medium").lower()
            if sev == "critical":
                critical_count += 1
            elif sev == "high":
                high_count += 1
            elif sev == "medium":
                medium_count += 1
            elif sev == "low":
                low_count += 1
            else:
                info_count += 1

            sc_name = f.scanner or "unknown"
            scanner_breakdown[sc_name] = scanner_breakdown.get(sc_name, 0) + 1

            finding_responses.append(FindingResponse.model_validate(f))

        summary = ScanSummaryResponse(
            total_findings=len(findings),
            critical=critical_count,
            high=high_count,
            medium=medium_count,
            low=low_count,
            info=info_count,
            scanner_breakdown=scanner_breakdown,
        )

        duration_seconds = None
        if scan.started_at and scan.completed_at:
            duration_seconds = round((scan.completed_at - scan.started_at).total_seconds(), 2)

        # Scanners run list and AI analysis from configuration/summary dicts
        raw_config = scan.configuration or {}
        scanners_run = raw_config.get("scanners_run", [])
        ai_analysis = raw_config.get("ai_analysis")
        coverage_summary = raw_config.get("coverage_summary")
        scanner_matrix = raw_config.get("scanner_matrix")

        cov_summary = coverage_summary or {}
        files_disc = getattr(scan, "files_discovered", 0) or cov_summary.get("files_discovered", 0)
        files_sc = getattr(scan, "files_scanned", 0) or cov_summary.get("files_scanned", 0)
        files_sk = getattr(scan, "files_skipped", 0) or cov_summary.get("files_skipped", 0)
        skip_man = getattr(scan, "skip_manifest", None) or cov_summary.get("skip_manifest")

        return ScanReportResponse(
            scan_id=scan.id,
            repository_id=repository.id,
            repository_url=repository.url,
            repository_full_name=repository.full_name,
            commit_sha=scan.commit_sha or repository.pinned_sha,
            default_branch=repository.default_branch,
            status=scan.status,
            stage=scan.stage,
            error_message=scan.error_message,
            started_at=scan.started_at,
            completed_at=scan.completed_at,
            duration_seconds=duration_seconds,
            metadata=repository.metadata_json,
            files_discovered=files_disc,
            files_scanned=files_sc,
            files_skipped=files_sk,
            skip_manifest=skip_man,
            summary=summary,
            findings=finding_responses,
            ai_analysis=ai_analysis,
            scanners_run=scanners_run,
            coverage_summary=coverage_summary,
            scanner_matrix=scanner_matrix,
            generated_at=datetime.datetime.now(datetime.timezone.utc),
        )
