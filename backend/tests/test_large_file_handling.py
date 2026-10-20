"""
AgentGuard AI — Large File & Archive Security Tests.
Tests all five defensive layers:
- Layer 1: Streaming upload abortion on size limit & partial file cleanup
- Layer 2: Safe extraction (Zip bomb ratio & total size rejection, file count quotas, Zip Slip, oversized single file skip)
- Layer 3: Pre-scan file filtering (Junk dir exclusion, binary detection, 1MB source cap)
- Layer 4: Scanner timeout recorded as 'timed_out' (never 0 findings)
- Layer 5: AI windowed snippet extraction (±15 lines, char cap, credential redaction)
- Layer 6: Honest skip_manifest persistence on Scan model
"""
from __future__ import annotations

import io
import tempfile
import zipfile
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException, UploadFile

from app.ai.context import extract_finding_context
from app.config import get_settings
from app.models.scan import Scan
from app.scanners.base import ScannerResult
from app.scanners.filters import build_scan_file_list, is_binary_file
from app.services.extraction import (
    ArchiveRejected,
    extract_safe_archive,
    is_unsafe_path,
    validate_archive,
)
from app.services.upload import save_upload_streaming


# ── Layer 1: Streaming Upload Tests ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_streaming_upload_success(tmp_path: Path):
    dest = tmp_path / "uploaded.zip"
    content = b"PK\x03\x04" + b"A" * 1024

    mock_file = AsyncMock(spec=UploadFile)
    mock_file.read.side_effect = [content[:512], content[512:], b""]

    total = await save_upload_streaming(mock_file, dest, max_bytes=10 * 1024)
    assert total == len(content)
    assert dest.exists()
    assert dest.read_bytes() == content


@pytest.mark.asyncio
async def test_streaming_upload_abort_at_size_limit(tmp_path: Path):
    dest = tmp_path / "oversized.zip"
    chunk = b"X" * 1024

    mock_file = AsyncMock(spec=UploadFile)
    mock_file.read.side_effect = [chunk, chunk, chunk]  # 3 KB

    # Set limit to 2 KB
    with pytest.raises(HTTPException) as exc_info:
        await save_upload_streaming(mock_file, dest, max_bytes=2048, chunk_size=1024)

    assert exc_info.value.status_code == 413
    assert not dest.exists()  # Ensure partial file was unlinked


# ── Layer 2: Safe Extraction & Zip Bomb Tests ────────────────────────────────

def test_unsafe_path_detection():
    assert is_unsafe_path("../etc/passwd") is True
    assert is_unsafe_path("/etc/shadow") is True
    assert is_unsafe_path("foo/../../bar") is True
    assert is_unsafe_path("C:\\Windows\\System32") is True
    assert is_unsafe_path("safe/path/file.py") is False


def test_zip_bomb_rejection_compression_ratio(tmp_path: Path):
    zip_path = tmp_path / "bomb_ratio.zip"
    dest_dir = tmp_path / "extracted"

    # Create a zip member with artificially high compression ratio (> 100x)
    data = b"0" * 200_000
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("huge_sparse.txt", data)

    with zipfile.ZipFile(zip_path, "r") as zf:
        # Default ratio limit is 100
        with pytest.raises(ArchiveRejected) as exc_info:
            validate_archive(zf, dest_dir, max_compression_ratio=50)
        assert "Suspicious compression ratio" in str(exc_info.value)


def test_zip_bomb_rejection_total_size(tmp_path: Path):
    zip_path = tmp_path / "bomb_total.zip"
    dest_dir = tmp_path / "extracted"

    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("file1.txt", b"A" * 5000)
        zf.writestr("file2.txt", b"B" * 6000)

    with zipfile.ZipFile(zip_path, "r") as zf:
        with pytest.raises(ArchiveRejected) as exc_info:
            validate_archive(zf, dest_dir, max_extracted_bytes=8000)
        assert "Total extracted size exceeds" in str(exc_info.value)


def test_archive_too_many_files_rejected(tmp_path: Path):
    zip_path = tmp_path / "too_many_files.zip"
    dest_dir = tmp_path / "extracted"

    with zipfile.ZipFile(zip_path, "w") as zf:
        for i in range(15):
            zf.writestr(f"file_{i}.txt", b"content")

    with zipfile.ZipFile(zip_path, "r") as zf:
        with pytest.raises(ArchiveRejected) as exc_info:
            validate_archive(zf, dest_dir, max_file_count=10)
        assert "limit 10" in str(exc_info.value)


def test_oversized_single_file_skip_and_record(tmp_path: Path):
    zip_path = tmp_path / "with_oversized.zip"
    dest_dir = tmp_path / "extracted"

    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("normal.py", b"print('hello')")
        zf.writestr("huge_data.bin", b"D" * 50_000)

    # Set single file limit to 20 KB
    extracted, skipped = extract_safe_archive(
        zip_path=zip_path,
        dest_dir=dest_dir,
        max_single_file_bytes=20_000,
        max_extracted_bytes=100_000,
    )

    # Normal file was extracted
    assert any("normal.py" in str(p) for p in extracted)
    assert (dest_dir / "normal.py").exists()

    # Oversized file was skipped, NOT extracted, but recorded
    assert not (dest_dir / "huge_data.bin").exists()
    assert len(skipped) == 1
    assert skipped[0]["path"] == "huge_data.bin"
    assert "single_file_limit" in skipped[0]["reason"]


# ── Layer 3: Pre-Scan File Filters Tests ──────────────────────────────────────

def test_junk_dir_exclusion(tmp_path: Path):
    # Setup standard files & junk directories
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "app.py").write_text("print('hello')", encoding="utf-8")

    (tmp_path / "node_modules" / "pkg").mkdir(parents=True)
    (tmp_path / "node_modules" / "pkg" / "index.js").write_text("console.log()", encoding="utf-8")

    (tmp_path / ".venv" / "lib").mkdir(parents=True)
    (tmp_path / ".venv" / "lib" / "pip.py").write_text("# venv code", encoding="utf-8")

    (tmp_path / "dist").mkdir()
    (tmp_path / "dist" / "bundle.min.js").write_text("// minified", encoding="utf-8")

    scannable, skipped = build_scan_file_list(tmp_path)
    scannable_rel = [str(p.relative_to(tmp_path)).replace("\\", "/") for p in scannable]

    assert "src/app.py" in scannable_rel
    assert not any("node_modules" in p for p in scannable_rel)
    assert not any(".venv" in p for p in scannable_rel)
    assert not any("dist" in p for p in scannable_rel)


def test_binary_file_detection(tmp_path: Path):
    text_file = tmp_path / "script.py"
    text_file.write_text("a = 10\n", encoding="utf-8")
    assert is_binary_file(text_file) is False

    bin_file = tmp_path / "compiled.so"
    bin_file.write_bytes(b"\x7fELF\x02\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00")
    assert is_binary_file(bin_file) is True

    scannable, skipped = build_scan_file_list(tmp_path)
    skipped_reasons = {sk.path: sk.reason for sk in skipped}
    assert "compiled.so" not in [str(p.name) for p in scannable]


def test_max_scannable_file_bytes_exclusion(tmp_path: Path):
    small_file = tmp_path / "normal.py"
    small_file.write_text("x = 1\n", encoding="utf-8")

    big_file = tmp_path / "generated_huge.py"
    big_file.write_text("# " + "A" * 1500, encoding="utf-8")  # 1502 bytes

    # Set threshold to 1000 bytes
    scannable, skipped = build_scan_file_list(tmp_path, max_file_bytes=1000)

    scannable_names = [p.name for p in scannable]
    assert "normal.py" in scannable_names
    assert "generated_huge.py" not in scannable_names

    assert len(skipped) == 1
    assert skipped[0].path == "generated_huge.py"
    assert skipped[0].reason == "exceeds_1mb_source_limit"


# ── Layer 4: Scanner Timeout Status ──────────────────────────────────────────

def test_scanner_result_status_timed_out():
    res = ScannerResult(
        scanner="Bandit",
        scanner_version="1.8.5",
        status="timed_out",
        error="Bandit execution timed out after 300 seconds",
        duration_seconds=300.0,
    )
    assert res.status == "timed_out"
    assert res.findings == []
    assert "timed out" in res.error


# ── Layer 5: AI Context Window Snippet Extraction ────────────────────────────

def test_ai_finding_context_window_and_truncation(tmp_path: Path):
    test_file = tmp_path / "vulnerable.py"
    lines = [f"line_{i} = {i}" for i in range(1, 51)]
    lines[24] = "eval(user_input)  # line 25 vulnerable"
    test_file.write_text("\n".join(lines), encoding="utf-8")

    # Extract context around line 25 with ±5 lines
    snippet = extract_finding_context(
        file_path=test_file,
        line_number=25,
        context_lines=5,
        max_chars=2000,
    )

    # Line 25 must have the target marker >>
    assert ">> 25: eval(user_input)" in snippet
    # Context window lines 20 to 30 should be present
    assert "20: line_20" in snippet
    assert "30: line_30" in snippet
    # Lines far outside (e.g. line 5 or line 45) should NOT be present
    assert "5: line_5" not in snippet
    assert "45: line_45" not in snippet


def test_ai_finding_context_credential_redaction(tmp_path: Path):
    test_file = tmp_path / "config.py"
    test_file.write_text(
        "api_key = 'ghp_123456789012345678901234567890123456'\n"
        "eval(user_input)\n",
        encoding="utf-8",
    )

    snippet = extract_finding_context(
        file_path=test_file,
        line_number=2,
        context_lines=5,
    )
    assert "ghp_12345678901234567890" not in snippet
    assert "[REDACTED_GITHUB_PAT]" in snippet


# ── Layer 6: Scan Model Skip Manifest Persistence ────────────────────────────

def test_scan_model_skip_manifest_fields():
    scan = Scan(
        status="completed",
        files_discovered=851,
        files_scanned=847,
        files_skipped=4,
        skip_manifest={
            "exceeds_1mb_source_limit": ["data/huge_generated.py", "models/weights.py"],
            "binary_file": ["assets/logo.png"],
            "timed_out_scanners": ["Semgrep"],
        },
    )
    assert scan.files_discovered == 851
    assert scan.files_scanned == 847
    assert scan.files_skipped == 4
    assert len(scan.skip_manifest["exceeds_1mb_source_limit"]) == 2
    assert scan.skip_manifest["timed_out_scanners"] == ["Semgrep"]
