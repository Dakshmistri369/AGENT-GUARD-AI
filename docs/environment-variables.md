# AgentGuard AI — Production Environment Variable Specification & Audit

> **Deployment Target**: Render (FastAPI Web + arq Background Worker) ↔ Vercel (React 19 / Vite SPA)  
> **Audit Status**: Verified against source code (`backend/app/config.py`, `render.yaml`, `frontend/src/lib/api.ts`, `frontend/vercel.json`).  
> **Security Policy**: Secret credentials (passwords, JWT secrets, private API keys) are strictly redacted.

---

## 1. Connecting Variables (Render ↔ Vercel Cross-Service Link)

These variables bind the Vercel frontend deployment (`https://agentguard-alpha-teal.vercel.app`) to the Render backend service (`https://agent-guard-ai.onrender.com`):

| Variable Name | Service | Purpose | Required? | Configured Production Value |
| :--- | :--- | :--- | :--- | :--- |
| `FRONTEND_ORIGIN` | Render Backend | Comma-separated CORS allowed origins. Permits browser requests from Vercel to Render. | **Required** (fails fast in prod if `*` or omitted) | `https://agentguard-alpha-teal.vercel.app,http://localhost:5173` |
| `VITE_API_BASE_URL` | Vercel Frontend | API root URL for HTTP/REST calls from the React client. | Optional (defaults to `/api` rewrite proxy on Vercel) | `/api` (or `https://agent-guard-ai.onrender.com`) |
| `vercel.json` Rewrite | Vercel Platform | Edge reverse proxy redirecting `/api/*` and `/health` to Render backend with zero-CORS latency. | **Required** | `/api/:match*` → `https://agent-guard-ai.onrender.com/api/:match*` |

---

## 2. Complete Environment Variable Audit Table

| Variable Name | Service Target | Purpose | Type | Required? | Production Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `PYTHON_VERSION` | Render Web & Worker | Enforces Python runtime version during container build. | Config | Required | `3.11.9` (Set in `render.yaml`) |
| `ENVIRONMENT` | Render Web & Worker | Sets app runtime profile (`development`, `staging`, `production`). Enforces strict security validation when `production`. | Config | **Required** | `production` (Set) |
| `DEBUG` | Render Web & Worker | Toggles debug mode and verbose tracebacks. Must be `false` in production. | Boolean | Optional (Default: `false`) | `false` (Set) |
| `DATABASE_URL` | Render Web & Worker | Async PostgreSQL database connection string (`postgresql+asyncpg://...`). | Secret | **Required** | `SET` (Supabase connection pooler via `render.yaml` sync) |
| `REDIS_URL` | Render Web & Worker | Redis connection URL (`rediss://...` or `redis://...`) for arq worker queue and rate limiter. | Secret | **Required** in prod for async scans | `SET` (Managed Redis via `render.yaml` sync) |
| `JWT_SECRET` | Render Web | Cryptographic secret used to sign and verify fallback authorization tokens. | Secret | **Required** in prod (must not match sentinel) | `SET` (Render `generateValue: true`) |
| `SUPABASE_URL` | Web, Worker & Frontend | Canonical Supabase project REST URL (`https://<project-ref>.supabase.co`). | Config | **Required** | `SET` (`https://ohnwhldqnemjvpjvpclw.supabase.co`) |
| `SUPABASE_PUBLISHABLE_KEY` | Render Web & Worker | Public client authentication anon key. | Config | Optional | `SET` (`sb_publishable_EZSCRcAT...`) |
| `SUPABASE_JWT_SECRET` | Render Web | Supabase JWT secret for validating user session tokens in stateless auth. | Secret | Optional in zero-config demo mode | `SET` / Verified in Auth middleware |
| `ENABLE_DEMO_AUTH` | Render Web | Enables fallback demo user authorization when external SSO is unconfigured. | Boolean | Optional (Default: `true` in zero-config) | `true` (Set in `render.yaml`) |
| `AGENTGUARD_ALLOW_MOCK_IN_PRODUCTION` | Render Web | Explicit safety acknowledgement to allow mock AI review without failing fast. | Boolean | Optional | `1` (Set in `render.yaml`) |
| `AI_PROVIDER` | Render Web & Worker | AI Review engine provider (`mock` or `nemotron`). | Config | Optional (Default: `mock`) | `nemotron` (Set in `render.yaml`) |
| `AI_API_KEY` / `NVIDIA_API_KEY` | Render Web & Worker | NVIDIA API Key for Nemotron LLM inference. | Secret | Required if `AI_PROVIDER=nemotron` in prod | `SET` (Render secret sync) |
| `AI_BASE_URL` | Render Web & Worker | Base URL for LLM chat completion API endpoint. | URL | Optional (Default: NVIDIA integrate URL) | `https://integrate.api.nvidia.com/v1` |
| `AI_MODEL` | Render Web & Worker | LLM model identifier. | String | Optional | `nvidia/llama-3.1-nemotron-70b-instruct` |
| `AI_TIMEOUT_SECONDS` | Render Web & Worker | Maximum timeout for an AI analysis request before graceful fallback. | Seconds | Optional (Default: `60`) | Default `60` |
| `QUEUE_NAME` | Render Web & Worker | Arq Redis queue name. Must match exactly between web API and background worker. | String | Optional (Default: `agentguard:scans`) | `agentguard:scans` (Matched) |
| `SEMGREP_RULE_TIMEOUT_SECONDS` | Render Web & Worker | Semgrep per-rule execution timeout (0 = unconstrained official Semgrep rule run). | Seconds | Optional (Default: `0`) | `0` (Set in `render.yaml`) |
| `SCANNER_TIMEOUT_SECONDS` | Render Web & Worker | Subprocess execution timeout per scanner tool. | Seconds | Optional (Default: `600`) | Default `600` (10 min) |
| `SCANNER_JOB_MAX_RUNTIME_SECONDS`| Render Web & Worker | Outer ceiling timeout for an entire repository scan across all scanners. | Seconds | Optional (Default: `1800`) | `1800` (30 min, set in `render.yaml`) |
| `MAX_CONCURRENT_SCANS_PER_USER` | Render Web | Per-user active scan cap preventing starvation. | Integer | Optional (Default: `5`) | `5` |
| `MAX_QUEUE_DEPTH` | Render Web | Backpressure queue threshold before returning HTTP 429 Too Many Requests. | Integer | Optional (Default: `100`) | `100` |
| `MAX_DAILY_SCANS_PER_USER` | Render Web | Rolling 24-hour scan quota per user account. | Integer | Optional (Default: `50`) | `50` |
| `RATE_LIMIT_PER_MINUTE_API` | Render Web | General API requests rate limit per client IP/user. | Integer | Optional (Default: `60`) | `60` |
| `RATE_LIMIT_PER_MINUTE_SCAN` | Render Web | Scan dispatch rate limit per client. | Integer | Optional (Default: `10`) | `10` |
| `MAX_REPO_CLONE_SIZE_MB` | Render Web & Worker | Maximum repository clone size in megabytes before switching to metadata analysis. | Integer | Optional (Default: `500`) | `500` MB |
| `DB_POOL_SIZE` | Render Web & Worker | SQLAlchemy connection pool size (sized for Supabase 60-connection pooler limit). | Integer | Optional (Default: `5`) | `5` |
| `DB_MAX_OVERFLOW` | Render Web & Worker | Maximum overflow connections allowed during concurrency bursts. | Integer | Optional (Default: `5`) | `5` |
| `GITHUB_TOKEN` | Render Web & Worker | Optional server-side personal access token for higher GitHub REST API rate limits. | Secret | Optional | Optional |
| `VITE_API_BASE_URL` | Vercel Frontend | API Base URL bundled into the frontend application during `vite build`. | URL | Optional (Vercel rewrite handles `/api`) | `/api` |
| `VITE_SUPABASE_URL` | Vercel Frontend | Client Supabase project endpoint for client-side Auth. | URL | Optional | `https://ohnwhldqnemjvpjvpclw.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Vercel Frontend | Client Supabase anonymous API key for client-side Auth. | String | Optional | `sb_publishable_EZSCRcAT...` |

---

## 3. Discrepancy & Health Verification

1. **Vite Prefix Enforcement**:
   - All frontend variables read by `frontend/src` are prefixed with `VITE_` (`VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
   - Non-prefixed variables are intentionally isolated to the server, preventing accidental bundle leakage.
2. **CORS & Rewrite Parity**:
   - `render.yaml` sets `FRONTEND_ORIGIN` to `https://agentguard-alpha-teal.vercel.app,http://localhost:5173`.
   - `frontend/vercel.json` provides edge rewrites for `/api/*` and `/health`, ensuring requests reach `https://agent-guard-ai.onrender.com` without cross-origin preflight latency.
3. **Queue Name Consistency**:
   - Both Web API and Worker service default to `QUEUE_NAME = agentguard:scans`, ensuring complete job dispatch and execution symmetry.
