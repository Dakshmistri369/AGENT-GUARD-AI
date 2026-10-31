# AgentGuard AI — Security Architecture & Threat Model

## 1. Authentication & Identity Isolation

### Multi-Tenant JWT Verification
- **Frontend**: The React client uses only the public `VITE_SUPABASE_ANON_KEY` to authenticate against Supabase Auth.
- **Backend**: FastAPI validates every inbound `Authorization: Bearer <token>` header:
  1. Header signature decoding using the Supabase JWKS endpoint (`/.well-known/jwks.json`) for asymmetric ES256/RS256 algorithms.
  2. Fallback to `SUPABASE_JWT_SECRET` verification for symmetric HS256 tokens.
  3. Verification of `exp` (expiration), `aud == "authenticated"`, and `sub` (user UUID).
- **Zero Cross-Tenant Leakage**:
  - Every SQL query on `repositories`, `scans`, `findings`, and `artifacts` filters explicitly by `user_id == current_user.id`.
  - Storage bucket RLS policies reject read/write operations outside `(storage.foldername(name))[1] == auth.uid()::text`.

---

## 2. Server-Side Request Forgery (SSRF) Defense

When a user registers or scans a repository URL, it passes through `validate_repository_url_for_ssrf()` in `backend/app/core/security.py`:

1. **Protocol Constraint**: Strictly requires `https://`. Insecure `http://`, `ftp://`, `file://`, `gopher://`, or `javascript:` schemes are rejected with HTTP 400.
2. **Domain Whitelisting**: Only legitimate `github.com` hostnames are permitted. Subdomains and lookalike domains (`evil-github.com`) are blocked.
3. **Private IP & Loopback Filter**:
   - `127.0.0.0/8` (Localhost loopback)
   - `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` (RFC 1918 private subnets)
   - `169.254.0.0/16` (Cloud instance metadata services — AWS, GCP, Azure, DigitalOcean)
   - `::1/128`, `fc00::/7`, `fe80::/10` (IPv6 loopback, ULA, link-local)
4. **Credential Stripping**: URLs containing embedded user info (e.g. `https://user:pass@github.com/...`) are rejected.

---

## 3. Worker Sandboxing & Safe Subprocess Execution

AgentGuard executes Semgrep, Bandit, and OSV inside ephemeral isolated sandbox environments:
- **Shallow Ephemeral Clones**: Repositories are cloned using `git clone --depth 1 --single-branch --filter=blob:none` into an isolated temporary directory (`tempfile.mkdtemp()`).
- **Deterministic Cleanup**: An asynchronous context manager (`ephemeral_repository_workspace`) ensures the directory is aggressively scrubbed in a `finally` block, even if the scan times out or crashes.
- **Tool Memory & Time Bounds**:
  - `SEMGREP_TIMEOUT`: Hard cap per rule/file (default 300s).
  - `--max-memory`: Semgrep memory capped at 2048 MB to prevent OOM denial-of-service.
  - Subprocess executed with unprivileged user permissions and clean environment variables.

---

## 4. Log Sanitization & Secret Scrubbing

The backend logging pipeline integrates `SecretSanitizingFilter` (`backend/app/core/logging.py`):
- Regular expressions intercept all log records before output.
- Automatically scrubs:
  - Bearer JWT tokens (`Bearer eyJ...` -> `Bearer [REDACTED_JWT]`)
  - GitHub personal access tokens (`ghp_...`, `github_pat_...`)
  - Database passwords (`postgresql://user:pass@host...`)
  - Redis passwords (`redis://:pass@host...`)
  - NVIDIA / OpenAI API keys (`nvapi-...`, `sk-...`)
