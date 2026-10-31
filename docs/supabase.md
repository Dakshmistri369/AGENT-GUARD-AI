# AgentGuard AI — Supabase Backend Integration Guide

## 1. Architectural Overview

AgentGuard AI uses Supabase as its primary cloud data, authentication, and artifact storage plane:
- **Supabase Auth**: Issues signed JSON Web Tokens (JWT) using either asymmetric keypairs (ES256 / RS256 via JWKS) or symmetric keys (HS256).
- **Supabase PostgreSQL**: Hosts relational entities (`profiles`, `repositories`, `scans`, `findings`, `scan_artifacts`, `scan_jobs`) with strict Row Level Security (RLS).
- **Supabase Storage**: Hosts private, encrypted buckets (`scan-reports`, `scan-logs`, `repo-snapshots`) with 25MB file caps, MIME-type restrictions, and 10-minute temporary signed download URLs.

```
React (Vite) Frontend
   │ (Publishable Key Only)
   ▼
Supabase Auth (JWT) ────► FastAPI Backend
                             │ (Service Role Secret Key)
                             ├─► Supabase PostgreSQL (RLS / Pooler)
                             ├─► Supabase Storage (Private Buckets)
                             └─► Redis + Arq (Scan Execution Workers)
```

---

## 2. Database Schema & Tables

All database tables are created via reproducible SQL migrations located in `supabase/migrations/`:

### `profiles`
Stores user profile information automatically mirrored from `auth.users` via database trigger.
- `id` (`uuid`, Primary Key, references `auth.users(id) ON DELETE CASCADE`)
- `email` (`text`, unique, not null)
- `full_name` (`text`)
- `avatar_url` (`text`)
- `role` (`text`, default `'user'`)
- `created_at`, `updated_at` (`timestamptz`)

### `repositories`
Tracks connected Git repositories monitored for security vulnerabilities.
- `id` (`uuid`, Primary Key, default `gen_random_uuid()`)
- `user_id` (`uuid`, references `profiles(id) ON DELETE CASCADE`)
- `name` (`text`, not null)
- `full_name` (`text`, not null)
- `url` (`text`, not null, validated against SSRF)
- `default_branch` (`text`, default `'main'`)
- `is_private` (`boolean`, default `false`)
- `created_at`, `updated_at` (`timestamptz`)

### `scans`
Records every security audit executed across Semgrep, Bandit, and OSV.
- `id` (`uuid`, Primary Key, default `gen_random_uuid()`)
- `repository_id` (`uuid`, references `repositories(id) ON DELETE CASCADE`)
- `user_id` (`uuid`, references `profiles(id) ON DELETE CASCADE`)
- `branch` (`text`, default `'main'`)
- `commit_hash` (`text`)
- `status` (`text`, check constraint: `pending`, `queued`, `running`, `completed`, `failed`, `cancelled`, `partial`)
- `findings_count` (`integer`, default `0`)
- `critical_count`, `high_count`, `medium_count`, `low_count` (`integer`, default `0`)
- `duration_seconds` (`numeric`)
- `error_message` (`text`)
- `created_at`, `completed_at` (`timestamptz`)

### `findings`
Normalized vulnerability findings across all security scanners.
- `id` (`uuid`, Primary Key)
- `scan_id` (`uuid`, references `scans(id) ON DELETE CASCADE`)
- `user_id` (`uuid`, references `profiles(id) ON DELETE CASCADE`)
- `scanner` (`text`, check constraint: `semgrep`, `bandit`, `osv`, `detect-secrets`)
- `rule_id` (`text`, not null)
- `title` (`text`, not null)
- `description` (`text`)
- `severity` (`text`, check constraint: `critical`, `high`, `medium`, `low`, `info`, `unknown`)
- `category` (`text`)
- `file_path` (`text`)
- `line_start`, `line_end` (`integer`)
- `code_snippet` (`text`)
- `cwe`, `cve` (`text`)
- `package_name`, `package_version`, `fixed_version` (`text`)
- `remediation_patch` (`text`)
- `is_false_positive` (`boolean`, default `false`)
- `created_at` (`timestamptz`)

### `scan_artifacts`
Metadata for scan reports, logs, and patches stored in Supabase Storage.
- `id` (`uuid`, Primary Key)
- `scan_id` (`uuid`, references `scans(id) ON DELETE CASCADE`)
- `user_id` (`uuid`, references `profiles(id) ON DELETE CASCADE`)
- `artifact_type` (`text`: `report`, `sarif`, `log`, `sbom`, `raw_output`)
- `file_name` (`text`, not null)
- `storage_bucket` (`text`, not null)
- `storage_path` (`text`, not null)
- `file_size_bytes` (`bigint`)
- `mime_type` (`text`)
- `created_at` (`timestamptz`)

### `scan_jobs`
Arq background job telemetry tracking worker attempts, leases, and errors.
- `id` (`uuid`, Primary Key)
- `scan_id` (`uuid`, references `scans(id) ON DELETE CASCADE`)
- `user_id` (`uuid`, references `profiles(id) ON DELETE CASCADE`)
- `arq_job_id` (`text`)
- `status` (`text`, default `'queued'`)
- `attempts` (`integer`, default `0`)
- `last_error` (`text`)
- `created_at`, `updated_at` (`timestamptz`)

---

## 3. Storage Bucket Design & Access Control

Three private storage buckets are created via `supabase/migrations/20261031120001_create_storage_buckets.sql`:

1. **`scan-reports`**: JSON/SARIF audit summaries, unified git patches, executive markdown reports.
   - Max file size: 25 MB (`26214400` bytes).
   - Allowed MIME types: `application/json`, `text/plain`, `text/markdown`, `text/x-diff`.
2. **`scan-logs`**: Raw stderr/stdout diagnostic logs from Semgrep, Bandit, and OSV.
   - Max file size: 25 MB.
   - Allowed MIME types: `text/plain`, `application/json`.
3. **`repo-snapshots`**: Ephemeral compressed tarballs/archives.
   - Max file size: 25 MB.
   - Allowed MIME types: `application/gzip`, `application/x-tar`, `application/zip`.

### Storage Path Convention
All artifacts follow strict user-partitioned paths:
```
scan-reports/{user_id}/{scan_id}/{file_name}
scan-logs/{user_id}/{scan_id}/{scanner_name}.log
repo-snapshots/{user_id}/{repository_id}/{snapshot_name}.tar.gz
```

### Row Level Security on `storage.objects`
RLS enforces that clients can only access or modify files located within their own `user_id` prefix:
```sql
(storage.foldername(name))[1] = auth.uid()::text
```

### Temporary Signed URLs
Because buckets are private, direct downloads require a pre-signed URL generated by FastAPI:
- **Default TTL**: 600 seconds (10 minutes), configurable via `SIGNED_URL_EXPIRY_SECONDS`.
- **Authorization Check**: FastAPI checks that `scan.user_id == current_user.id` before issuing a signed URL.

---

## 4. Setup & Migration Guide

### Option A: Using the Supabase CLI
```bash
# Link project
supabase link --project-ref <your-project-ref>

# Apply migrations
supabase db push
```

### Option B: Using the Supabase Dashboard
1. Navigate to **SQL Editor** in the Supabase Dashboard.
2. Open and execute `supabase/migrations/20261031120000_create_agentguard_schema.sql`.
3. Open and execute `supabase/migrations/20261031120001_create_storage_buckets.sql`.
4. Under **Project Settings -> Database**, copy the Connection String (use port 6543 / PgBouncer mode in production).
