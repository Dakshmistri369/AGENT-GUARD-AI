"""
AgentGuard AI — Safe Archive Extraction Service.
Enforces Zip Slip defenses, zip bomb protection (compression ratio and total extracted limits),
file count quotas, and oversized single-file skipping.
"""
from __future__ import annotations

import logging
import os
import zipfile
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.security.workspace import is_safe_path

logger = logging.getLogger("agentguard.services.extraction")


class ArchiveRejected(Exception):
    """Raised when an archive violates security constraints (traversal, zip bomb, file limits)."""
    pass


def is_unsafe_path(filename: str) -> bool:
    """Check for obvious path traversal in raw archive member filename."""
    normalized = filename.replace("\\", "/")
    if normalized.startswith("/") or normalized.startswith("../") or "/../" in normalized:
        return True
    if len(normalized) > 1 and normalized[1] == ":":  # Windows drive letter
        return True
    return False


def validate_archive(
    zf: zipfile.ZipFile,
    dest_dir: Path,
    max_file_count: int | None = None,
    max_extracted_bytes: int | None = None,
    max_single_file_bytes: int | None = None,
    max_compression_ratio: int | None = None,
) -> tuple[list[zipfile.ZipInfo], list[dict[str, Any]]]:
    """
    Validate zip archive safety.
    Returns:
        (safe_members_to_extract, skipped_files_manifest)
    Raises:
        ArchiveRejected on security hazards (Zip Slip, Zip Bomb, Total Limit).
    """
    settings = get_settings()
    dest_dir.mkdir(parents=True, exist_ok=True)
    file_count_limit = max_file_count or settings.max_archive_files
    extracted_bytes_limit = max_extracted_bytes or settings.max_extracted_size_bytes
    single_file_limit = max_single_file_bytes or settings.max_single_file_bytes
    compression_ratio_limit = max_compression_ratio or settings.max_compression_ratio

    infos = zf.infolist()
    if len(infos) > file_count_limit:
        raise ArchiveRejected(
            f"Archive contains {len(infos)} files (limit {file_count_limit})"
        )

    total_uncompressed = 0
    safe_members: list[zipfile.ZipInfo] = []
    skipped: list[dict[str, Any]] = []

    for info in infos:
        # Path traversal checks
        if is_unsafe_path(info.filename):
            raise ArchiveRejected(f"Unsafe path in archive: {info.filename}")

        target_candidate = dest_dir / info.filename
        if not is_safe_path(dest_dir, target_candidate):
            raise ArchiveRejected(f"Path traversal detected: {info.filename}")

        # Skip directory records in size calculation
        if info.is_dir() or info.filename.endswith("/"):
            safe_members.append(info)
            continue

        # Zip bomb detection: absurd compression ratio
        if info.compress_size > 0:
            ratio = info.file_size / info.compress_size
            if ratio > compression_ratio_limit:
                raise ArchiveRejected(
                    f"Suspicious compression ratio ({ratio:.0f}x) in {info.filename}"
                )

        total_uncompressed += info.file_size
        if total_uncompressed > extracted_bytes_limit:
            raise ArchiveRejected(
                f"Total extracted size exceeds {extracted_bytes_limit // (1024 * 1024)} MB limit"
            )

        # Oversized single file: skip it and record, do not abort whole scan
        if info.file_size > single_file_limit:
            logger.info("Skipping oversized file in archive: %s (%d bytes)", info.filename, info.file_size)
            skipped.append({
                "path": info.filename,
                "size": info.file_size,
                "reason": f"exceeds_{single_file_limit // (1024 * 1024)}mb_single_file_limit",
            })
            continue

        safe_members.append(info)

    return safe_members, skipped


def extract_safe_archive(
    zip_path: Path,
    dest_dir: Path,
    max_file_count: int | None = None,
    max_extracted_bytes: int | None = None,
    max_single_file_bytes: int | None = None,
    max_compression_ratio: int | None = None,
) -> tuple[list[Path], list[dict[str, Any]]]:
    """
    Validate and extract a ZIP archive safely into dest_dir.
    Returns:
        (extracted_paths, skipped_files)
    """
    dest_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as zf:
        safe_members, skipped = validate_archive(
            zf=zf,
            dest_dir=dest_dir,
            max_file_count=max_file_count,
            max_extracted_bytes=max_extracted_bytes,
            max_single_file_bytes=max_single_file_bytes,
            max_compression_ratio=max_compression_ratio,
        )

        extracted_paths: list[Path] = []
        for member in safe_members:
            zf.extract(member, dest_dir)
            extracted_path = dest_dir / member.filename
            if extracted_path.is_file():
                extracted_paths.append(extracted_path)

        return extracted_paths, skipped
