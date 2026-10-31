"""
AgentGuard AI — Scan Artifacts & Signed URL API Routes.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.models.artifact import ScanArtifact
from app.models.scan import Scan
from app.models.repository import Repository
from app.schemas.artifact import SignedUrlResponse
from app.services.storage_service import StorageService

router = APIRouter(prefix="/artifacts", tags=["Artifacts"])


@router.get("/{artifact_id}/download-url", response_model=SignedUrlResponse)
async def get_artifact_download_url(
    artifact_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a short-lived signed URL (10-minute expiry) to securely download a private artifact.
    Strictly verifies that the requesting user owns the repository/scan associated with the artifact.
    """
    query = select(ScanArtifact).where(ScanArtifact.id == artifact_id)
    result = await db.execute(query)
    artifact = result.scalar_one_or_none()

    if not artifact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Artifact {artifact_id} not found.",
        )

    # Verify ownership: check that the artifact's scan belongs to the current user
    scan_query = select(Scan).where(
        Scan.id == artifact.scan_id,
        Scan.repository_id.in_(
            select(Repository.id).where(Repository.owner_id == current_user.id)
        ),
    )
    scan_res = await db.execute(scan_query)
    scan = scan_res.scalar_one_or_none()

    if not scan and str(artifact.user_id) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this artifact.",
        )

    storage_svc = StorageService()
    signed_url = storage_svc.generate_signed_url(
        bucket_id=artifact.storage_bucket,
        storage_path=artifact.storage_path,
        expires_in=600,
    )

    return SignedUrlResponse(
        artifact_id=artifact.id,
        file_name=artifact.file_name,
        signed_url=signed_url,
        expires_in_seconds=600,
        storage_bucket=artifact.storage_bucket,
        storage_path=artifact.storage_path,
    )
