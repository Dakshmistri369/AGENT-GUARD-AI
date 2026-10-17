"""
Phase 1 project tests — real execution against in-memory SQLite.

Covers:
- Project creation (happy path)
- Validation (blank name, name too long, description too long)
- Pagination cap (page_size capped at MAX_PAGE_SIZE=100)
- Ownership isolation (404 when another user accesses your project)
- Deletion
- Health endpoint with real DB check
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


# ── Health ────────────────────────────────────────────────────────────────────

async def test_health_returns_db_status(client: AsyncClient) -> None:
    """Health endpoint must perform a real DB check and report the result."""
    r = await client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "healthy"
    assert body["database"]["status"] == "ok"
    assert body["database"]["type"] == "sqlite"
    assert "mode" in body["ai_provider"]
    assert body["ai_provider"]["mock_active"] == (body["ai_provider"]["mode"] == "mock")


# ── Project creation ──────────────────────────────────────────────────────────

async def test_create_project_happy_path(client: AsyncClient) -> None:
    """Create a project and verify all fields are returned correctly."""
    payload = {
        "name": "My Test App",
        "description": "A sample app for testing",
        "language": "python",
        "framework": "flask",
    }
    r = await client.post("/api/projects", json=payload)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "My Test App"
    assert body["description"] == "A sample app for testing"
    assert body["language"] == "python"
    assert body["framework"] == "flask"
    assert body["owner_id"] == 1  # demo user
    assert "id" in body
    assert "created_at" in body
    # Demo auth mode header must be present
    assert r.headers.get("x-auth-mode", "").startswith("DEMO")


async def test_create_project_minimal(client: AsyncClient) -> None:
    """Name-only project creation should succeed."""
    r = await client.post("/api/projects", json={"name": "Minimal Project"})
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Minimal Project"
    assert body["description"] is None


# ── Validation ────────────────────────────────────────────────────────────────

async def test_create_project_blank_name_rejected(client: AsyncClient) -> None:
    """Blank or whitespace-only name must be rejected."""
    r = await client.post("/api/projects", json={"name": "   "})
    assert r.status_code == 422


async def test_create_project_empty_name_rejected(client: AsyncClient) -> None:
    """Empty string name must be rejected."""
    r = await client.post("/api/projects", json={"name": ""})
    assert r.status_code == 422


async def test_create_project_name_too_long_rejected(client: AsyncClient) -> None:
    """Name exceeding 255 characters must be rejected."""
    r = await client.post("/api/projects", json={"name": "A" * 256})
    assert r.status_code == 422


async def test_create_project_description_too_long_rejected(client: AsyncClient) -> None:
    """Description exceeding 2000 characters must be rejected."""
    r = await client.post("/api/projects", json={"name": "Ok Name", "description": "X" * 2001})
    assert r.status_code == 422


async def test_create_project_missing_name_rejected(client: AsyncClient) -> None:
    """Missing 'name' field must be rejected."""
    r = await client.post("/api/projects", json={"description": "No name"})
    assert r.status_code == 422


# ── List & Pagination ─────────────────────────────────────────────────────────

async def test_list_projects_returns_only_own(client: AsyncClient, other_user_client: AsyncClient) -> None:
    """Each user only sees their own projects."""
    # Create one project as demo user
    await client.post("/api/projects", json={"name": "Demo User Project"})
    # Create one as other user
    await other_user_client.post("/api/projects", json={"name": "Other User Project"})

    # Demo user list
    r = await client.get("/api/projects")
    assert r.status_code == 200
    names = [p["name"] for p in r.json()["items"]]
    assert "Other User Project" not in names

    # Other user list
    r2 = await other_user_client.get("/api/projects")
    assert r2.status_code == 200
    names2 = [p["name"] for p in r2.json()["items"]]
    assert "Demo User Project" not in names2


async def test_list_pagination_fields(client: AsyncClient) -> None:
    """Pagination metadata must be present and consistent."""
    r = await client.get("/api/projects?page=1&page_size=5")
    assert r.status_code == 200
    body = r.json()
    assert "total" in body
    assert "page" in body
    assert "page_size" in body
    assert "pages" in body
    assert body["page"] == 1
    assert body["page_size"] == 5


async def test_pagination_cap_enforced(client: AsyncClient) -> None:
    """page_size > 100 must be rejected (422)."""
    r = await client.get("/api/projects?page_size=101")
    assert r.status_code == 422


async def test_pagination_invalid_page(client: AsyncClient) -> None:
    """page < 1 must be rejected (422)."""
    r = await client.get("/api/projects?page=0")
    assert r.status_code == 422


# ── Get single project ────────────────────────────────────────────────────────

async def test_get_project_by_id(client: AsyncClient) -> None:
    """Can retrieve a project by its ID."""
    create_r = await client.post("/api/projects", json={"name": "Fetchable Project"})
    project_id = create_r.json()["id"]

    r = await client.get(f"/api/projects/{project_id}")
    assert r.status_code == 200
    assert r.json()["id"] == project_id
    assert r.json()["name"] == "Fetchable Project"


async def test_get_nonexistent_project_returns_404(client: AsyncClient) -> None:
    """Non-existent project ID returns 404, not 500."""
    r = await client.get("/api/projects/999999")
    assert r.status_code == 404


# ── Ownership isolation (404, not 403) ────────────────────────────────────────

async def test_ownership_isolation_get(client: AsyncClient, other_user_client: AsyncClient) -> None:
    """
    Accessing another user's project returns 404 (not 403).
    This avoids leaking the existence of other users' resources.
    """
    # Create project as demo user
    create_r = await client.post("/api/projects", json={"name": "Private Project"})
    project_id = create_r.json()["id"]

    # Other user tries to access it
    r = await other_user_client.get(f"/api/projects/{project_id}")
    assert r.status_code == 404, (
        f"Expected 404 (not 403) to avoid resource existence leak, got {r.status_code}"
    )


async def test_ownership_isolation_delete(client: AsyncClient, other_user_client: AsyncClient) -> None:
    """Other user cannot delete demo user's project (404)."""
    create_r = await client.post("/api/projects", json={"name": "Delete Target"})
    project_id = create_r.json()["id"]

    r = await other_user_client.delete(f"/api/projects/{project_id}")
    assert r.status_code == 404

    # Project still exists for the owner
    r2 = await client.get(f"/api/projects/{project_id}")
    assert r2.status_code == 200


async def test_ownership_isolation_patch(client: AsyncClient, other_user_client: AsyncClient) -> None:
    """Other user cannot patch demo user's project (404)."""
    create_r = await client.post("/api/projects", json={"name": "Patch Target"})
    project_id = create_r.json()["id"]

    r = await other_user_client.patch(f"/api/projects/{project_id}", json={"name": "Hijacked"})
    assert r.status_code == 404


# ── Deletion ──────────────────────────────────────────────────────────────────

async def test_delete_project(client: AsyncClient) -> None:
    """Delete returns 204; subsequent GET returns 404."""
    create_r = await client.post("/api/projects", json={"name": "To Be Deleted"})
    project_id = create_r.json()["id"]

    del_r = await client.delete(f"/api/projects/{project_id}")
    assert del_r.status_code == 204

    get_r = await client.get(f"/api/projects/{project_id}")
    assert get_r.status_code == 404


async def test_delete_nonexistent_project_returns_404(client: AsyncClient) -> None:
    r = await client.delete("/api/projects/999999")
    assert r.status_code == 404


# ── Update ────────────────────────────────────────────────────────────────────

async def test_update_project(client: AsyncClient) -> None:
    """PATCH updates only supplied fields."""
    create_r = await client.post(
        "/api/projects",
        json={"name": "Old Name", "description": "Old desc", "language": "python"},
    )
    project_id = create_r.json()["id"]

    patch_r = await client.patch(f"/api/projects/{project_id}", json={"name": "New Name"})
    assert patch_r.status_code == 200
    body = patch_r.json()
    assert body["name"] == "New Name"
    assert body["description"] == "Old desc"   # unchanged
    assert body["language"] == "python"         # unchanged
