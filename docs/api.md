# AgentGuard AI — REST API Reference

Base URL: `/api`

All authenticated endpoints require an `Authorization: Bearer <supabase_jwt>` header.

---

## 1. Authentication & User Identity

### `GET /api/auth/me`
Return the authenticated user's profile and permissions.
- **Headers**: `Authorization: Bearer <jwt>`
- **Response 200**:
```json
{
  "id": "c1f7b03e-1082-411a-8260-26462be289da",
  "email": "auditor@example.com",
  "full_name": "Security Auditor",
  "avatar_url": null,
  "role": "user"
}
```

---

## 2. Repositories

### `POST /api/repositories`
Register a new repository for security scanning. Validates URL against SSRF.
- **Request Body**:
```json
{
  "url": "https://github.com/owner/repository",
  "name": "repository",
  "default_branch": "main",
  "is_private": false
}
```
- **Response 201**: `RepositoryResponse` object.

### `GET /api/repositories`
List all repositories owned by the authenticated user.
- **Query Params**: `page` (default 1), `per_page` (default 20).
- **Response 200**: Paginated list of repositories.

### `GET /api/repositories/{id}`
Retrieve a specific repository by ID.
- **Response 200**: `RepositoryResponse` object.
- **Response 404**: Repository not found or belongs to another tenant.

### `PATCH /api/repositories/{id}`
Update repository metadata (e.g. default branch, active status).

### `DELETE /api/repositories/{id}`
Delete a repository and cascade delete all associated scans, findings, and artifacts.

---

## 3. Scans

### `POST /api/scans`
Queue a new security audit job across Semgrep, Bandit, and OSV.
- **Request Body**:
```json
{
  "repository_id": "c1f7b03e-1082-411a-8260-26462be289da",
  "branch": "main"
}
```
- **Response 202**: Scan created with status `queued` and enqueued in Arq.

### `GET /api/scans`
List scan history with pagination and status filters.
- **Query Params**: `repository_id`, `status`, `page`, `per_page`.

### `GET /api/scans/{id}`
Retrieve detailed status, statistics, and tool durations for a specific scan.

### `GET /api/scans/{id}/status`
Lightweight polling endpoint returning scan status, progress percentage, and counts.

### `POST /api/scans/{id}/cancel`
Cancel an in-progress or queued scan.

---

## 4. Findings

### `GET /api/findings`
Query and filter security findings across all scans owned by the authenticated user.
- **Query Params**:
  - `scan_id`: Filter by specific scan.
  - `repository_id`: Filter across all scans for a repository.
  - `severity`: Filter by `critical`, `high`, `medium`, `low`, `info`.
  - `scanner`: Filter by `semgrep`, `bandit`, `osv`.
  - `category`: Filter by `injection`, `secret`, `dependency`, `crypto`, etc.
  - `page`, `per_page`: Pagination controls.

---

## 5. Artifacts & Private Storage

### `GET /api/scans/{scan_id}/artifacts`
List all reports, logs, and patches generated for a scan.

### `GET /api/artifacts/{id}/download-url`
Generate a temporary, pre-signed download URL for a private scan artifact.
- **Authorization**: Verifies caller owns the scan before issuing URL.
- **Response 200**:
```json
{
  "signed_url": "https://xyz.supabase.co/storage/v1/object/sign/scan-reports/...?token=...",
  "expires_in": 600,
  "artifact_type": "report",
  "file_name": "semgrep_report.json"
}
```

---

## 6. Health & Diagnostics

### `GET /api/health`
General system health, scanner toggles, and AI provider status.

### `GET /api/health/supabase`
Checks connectivity to Supabase PostgreSQL and Storage.

### `GET /api/health/redis`
Checks connectivity to Redis and the Arq background queue.
