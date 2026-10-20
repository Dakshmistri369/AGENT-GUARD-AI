"""
AgentGuard AI — Streaming Upload Handler.
Streams uploads directly to disk in chunks to prevent memory bloat and OOM crashes.
Aborts immediately if the running total exceeds MAX_UPLOAD_BYTES, cleaning up partial files.
"""
from __future__ import annotations

import logging
from pathlib import Path

import aiofiles
from fastapi import HTTPException, UploadFile

from app.config import get_settings

logger = logging.getLogger("agentguard.services.upload")

CHUNK_SIZE = 1024 * 1024  # 1 MB streaming chunks


async def save_upload_streaming(
    file: UploadFile,
    dest_path: Path,
    max_bytes: int | None = None,
    chunk_size: int = CHUNK_SIZE,
) -> int:
    """
    Stream upload file directly to disk, aborting immediately if running size exceeds limit.
    Cleans up any partially written files before raising HTTP 413.
    """
    settings = get_settings()
    max_upload_bytes = max_bytes if max_bytes is not None else settings.max_upload_size_bytes

    dest_path.parent.mkdir(parents=True, exist_ok=True)
    total = 0

    try:
        async with aiofiles.open(dest_path, "wb") as out:
            while chunk := await file.read(chunk_size):
                total += len(chunk)
                if total > max_upload_bytes:
                    await out.close()
                    dest_path.unlink(missing_ok=True)
                    logger.warning(
                        "Upload rejected: size %d exceeds limit of %d bytes",
                        total,
                        max_upload_bytes,
                    )
                    raise HTTPException(
                        status_code=413,
                        detail=f"Upload exceeds {settings.max_upload_size_mb} MB limit",
                    )
                await out.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:
        dest_path.unlink(missing_ok=True)
        logger.error("Error during streaming upload: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save upload archive: {exc}",
        ) from exc

    return total
