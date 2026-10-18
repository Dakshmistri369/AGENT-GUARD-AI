"""Top-level API router — registers all sub-routers."""
from fastapi import APIRouter

from app.api.health import router as health_router
from app.api.projects import router as projects_router
from app.api.ai import router as ai_router
from app.api.repositories import router as repositories_router
from app.api.scans import router as scans_router
from app.api.solutions import router as solutions_router

api_router = APIRouter()

# Health (not under /api prefix — mounted directly)
api_router.include_router(health_router)

# Resource endpoints under /api
api_router.include_router(projects_router, prefix="/api")
api_router.include_router(ai_router, prefix="/api")
api_router.include_router(repositories_router, prefix="/api")
api_router.include_router(scans_router)
api_router.include_router(solutions_router)
