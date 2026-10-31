"""Top-level API router — registers all sub-routers."""
from fastapi import APIRouter

from app.api.health import router as health_router
from app.api.projects import router as projects_router
from app.api.ai import router as ai_router
from app.api.repositories import router as repositories_router
from app.api.scans import router as scans_router
from app.api.solutions import router as solutions_router
from app.api.dashboard import router as dashboard_router
from app.api.auth import router as auth_router
from app.api.automation import router as automation_router

# Supabase backend modular routers
from app.api.routes_auth import router as new_auth_router
from app.api.routes_artifacts import router as artifacts_router
from app.api.routes_scans import router as new_scans_router
from app.api.routes_health import router as new_health_router
from app.api.routes_findings import router as new_findings_router

api_router = APIRouter()

# Health (not under /api prefix — mounted directly)
api_router.include_router(health_router)

# Resource endpoints under /api
api_router.include_router(new_health_router, prefix="/api")
api_router.include_router(new_auth_router, prefix="/api")
api_router.include_router(artifacts_router, prefix="/api")

# Mount legacy/existing scans router FIRST so static subpaths like /api/scans/active, /api/scans/active/cancel-all take precedence over /api/scans/{scan_id}
api_router.include_router(scans_router)
api_router.include_router(new_scans_router, prefix="/api")
api_router.include_router(new_findings_router, prefix="/api")

api_router.include_router(auth_router, prefix="/api")
api_router.include_router(automation_router, prefix="/api")
api_router.include_router(projects_router, prefix="/api")
api_router.include_router(ai_router, prefix="/api")
api_router.include_router(repositories_router, prefix="/api")
api_router.include_router(solutions_router)
api_router.include_router(dashboard_router)
