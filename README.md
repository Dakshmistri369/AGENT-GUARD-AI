# AgentGuard AI — GitHub Repository Integration & Multi-Engine Security Auditor

AgentGuard AI is an independent security and quality auditor for AI-generated and human-written software. AI coding tools generate software; AgentGuard independently verifies code security, audits dependencies, identifies architectural risks, and produces evidence-grounded reports.

This release introduces native **Multi-Engine Security Scanning** integrating **Semgrep**, **Bandit**, **OSV-Scanner**, and **detect-secrets** alongside safe **GitHub Repository Integration**, ephemeral workspace isolation, and zero-token public repository analysis.

---

## 1. Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │        AgentGuard AI Frontend          │
                      │     (React 19 + TypeScript + Vite)     │
                      │   - Security Scanner Engine Matrix     │
                      │   - Partial Coverage Warning Banner    │
                      │   - Multi-Engine Filterable Findings   │
                      └──────────────────┬─────────────────────┘
                                         │ /api/repositories/*
                                         │ /api/scans/*
                                         ▼
                      ┌────────────────────────────────────────┐
                      │          FastAPI Backend Engine        │
                      └────┬─────────────────┬──────────────┬──┘
                           │                 │              │
                           ▼                 ▼              ▼
                ┌──────────────────┐ ┌──────────────┐ ┌─────────────┐
                │ GitHub REST API  │ │ Safe Git Svc │ │ AI Review   │
                │ (v2022-11-28)    │ │ (Isolated WS)│ │ (Nemotron/  │
                │ Metadata & Tree  │ │ Subprocess   │ │  Mock)      │
                └──────────────────┘ └───────┬──────┘ └─────────────┘
                                             │
                                             ▼
                               ┌───────────────────────────┐
                               │   Scanner Orchestrator    │
                               │  - Project Type Detection │
                               │  - Selective Invocation   │
                               │  - 4MB Output Truncation  │
                               │  - Process Timeouts       │
                               └─────────────┬─────────────┘
                                             │
              ┌────────────────┬─────────────┴──┬──────────────────┐
              ▼                ▼                ▼                  ▼
       ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
       │   Semgrep   │  │   Bandit    │  │ OSV-Scanner  │  │detect-secrets│
       │ Multi-Lang  │  │ Python AST  │  │ Dependency   │  │ Credential & │
       │ SAST Engine │  │ SAST Linter │  │ CVE Scanner  │  │ Secret Audit │
       └─────────────┘  └─────────────┘  └──────────────┘  └──────────────┘
```

### Analysis Pipeline (6 Distinct Stages):
1. **Validating Repository**: Validates that the submitted URL is strictly an HTTPS GitHub repository URL (`https://github.com/{owner}/{repo}`). Rejects arbitrary schemes, malicious IP addresses, unexpected ports, path traversal attempts, and embedded credentials.
2. **Fetching Metadata**: Calls GitHub's official REST API to retrieve repository visibility, default branch, size, language breakdown, and pins the exact HEAD commit SHA.
3. **Inspecting File Tree**: Performs a safe, recursive metadata-only tree inspection without downloading file contents. Excludes `.git`, `node_modules`, `.venv`, and `dist`. Detects package manifests (`package.json`, `requirements.txt`, `pyproject.toml`, `Cargo.toml`, `go.mod`), test directories, config files, and CI workflows.
4. **Running Security Scanners**: Clones the pinned commit into an isolated ephemeral workspace with submodules, hooks, and LFS filters disabled. The `ScannerOrchestrator` determines applicable scanners based on detected project types, invokes available tools via isolated subprocesses with timeout and output limits, normalizes all findings into a unified schema, and redacts sensitive credentials.
5. **Reviewing Evidence**: If NVIDIA Nemotron (or Mock AI) is enabled, reviews sanitized findings grounded exclusively on verified scanner evidence to provide root-cause analysis, risk prioritization, and suggested verification tests.
6. **Generating the Report**: Persists findings, calculates severity metrics, logs scanner execution status and coverage matrices, and compiles an evidence-based report downloadable as structured JSON.

---

## 2. Security Scanner Engines

AgentGuard AI integrates four specialized open-source security scanners:

| Scanner | Category | Target Languages / Files | Description |
|---|---|---|---|
| **Semgrep** | Multi-Language SAST | Python, JS/TS, Go, Java, Rust, C/C++ | Semantic code pattern matching for OWASP Top 10 vulnerabilities, injection flaws, and insecure API usages. |
| **Bandit** | Python AST SAST | Python (`.py`, manifests) | Abstract Syntax Tree security linter scanning for `eval()`, hardcoded tempfiles, insecure cryptographic primitives, and shell execution. |
| **OSV-Scanner** | SCA / Vulnerability | Manifests (`package.json`, `requirements.txt`, etc.) | Open Source Vulnerabilities (OSV) database scanner identifying known CVEs and vulnerable library versions with offline manifest fallback rules. |
| **detect-secrets** | Credential Scanning | Universal (All source files) | High-entropy heuristics and regex patterns detecting hardcoded API keys, GitHub PATs, AWS secrets, and private keys with automatic redaction. |

### Project Type Detection & Applicability Logic
AgentGuard AI never wastes resources running irrelevant scanners:
- **Bandit** runs **only** if Python files (`.py`) or Python manifests (`requirements.txt`, `pyproject.toml`, `Pipfile`) are detected.
- **Semgrep** runs **only** if files with supported programming languages (`.py`, `.js`, `.ts`, `.go`, `.java`, etc.) are detected.
- **OSV-Scanner** runs **only** if dependency manifests or lockfiles (`package.json`, `requirements.txt`, `Cargo.toml`, etc.) are detected.
- **detect-secrets** runs across all repository types as credentials can leak in any codebase.

### Scanner Execution Guardrails & Untrusted Code Protection
AgentGuard AI strictly adheres to zero-trust principles when analyzing third-party repositories:
1. **No Script Execution**: Untrusted repository build scripts (`setup.py`, `npm postinstall`, `Makefile`, Gradle/Maven builds) are **NEVER** executed.
2. **No Host Dependency Installation**: Dependencies from `requirements.txt` or `package.json` are **NEVER** installed on the host system.
3. **Isolated Ephemeral Workspaces**: Clones are written to dedicated ephemeral directories under `scan_workspaces/` outside the web root, with safe path traversal guards and guaranteed cleanup in `finally:` blocks.
4. **Execution Timeouts**: Each scanner is governed by a strict timeout (default: 120 seconds). Any scanner exceeding the limit is cleanly terminated.
5. **Process Output Cap**: Subprocess stdout/stderr streams are monitored and capped at 4MB (`DEFAULT_MAX_OUTPUT_BYTES`) to prevent denial-of-service through pipe exhaustion.
6. **Container Isolation (Docker)**: When Docker is installed on the host, scanner invocations are dispatched inside disposable, unprivileged sandbox containers. When Docker is unavailable, processes run with non-shell argument lists and disabled execution privileges.
7. **Secret Redaction**: All findings pass through `redact_sensitive_text()` before storage, masking GitHub PATs (`ghp_...`), AWS keys (`AKIA...`), and private keys.

---

## 3. Normalized Finding Schema

All scanner outputs are normalized into AgentGuard's unified finding schema:

```json
{
  "scanner": "bandit",
  "scanner_version": "1.8.5",
  "rule_id": "B307",
  "title": "Unsafe Dynamic Code Execution (eval()): Use of possibly insecure function",
  "severity": "medium",
  "confidence": "high",
  "file_path": "src/app.py",
  "line_number": 4,
  "column_number": 1,
  "sanitized_evidence": "return eval(cmd)",
  "explanation": "Use of possibly insecure function - consider using safer ast.literal_eval.",
  "remediation": "Review Bandit B307 guidance: https://bandit.readthedocs.io/en/1.8.5/plugins/b307_eval.html",
  "verification_status": "unverified",
  "commit_sha": "9f7a31b...",
  "fingerprint": "0123456789abcdef"
}
```

### Coverage & Matrix Representation
Every scan response includes:
- `coverage_summary`: Total applicable scanners, executed scanners, skipped scanners, missing scanners, and incomplete coverage notices.
- `scanner_matrix`: Per-engine status including `available`, `version`, `applicable`, `applicability_reason`, `findings_count`, and `duration_seconds`.

---

## 4. Prerequisites & Required Software

| Software | Minimum Version | Purpose |
|---|---|---|
| **Python** | 3.11+ (Tested on 3.13) | FastAPI backend, SQLAlchemy ORM, Bandit, detect-secrets |
| **Node.js** | 18+ (Tested on 20+) | Vite, React 19 frontend development and build |
| **Git** | 2.30+ | Secure repository cloning into isolated workspaces |
| **Docker** (Optional) | 20.10+ | Containerized sandbox isolation for untrusted code |

### Installing Scanners
Install all backend tools and security scanners:
```powershell
# Python scanners
python -m pip install bandit semgrep detect-secrets

# Verify installations
bandit --version
semgrep --version
detect-secrets --version

# OSV-Scanner (Optional - binary or go install)
# go install github.com/google/osv-scanner/cmd/osv-scanner@latest
# Note: When osv-scanner binary is not installed, AgentGuard automatically falls back to offline manifest vulnerability heuristics and flags partial coverage in the UI.
```

---

## 5. Installation & Setup

### Step 1: Clone or Open Workspace
```powershell
cd "d:\AGENTGUARD AI"
```

### Step 2: Install Backend Dependencies
```powershell
python -m pip install -r backend/requirements-dev.txt
```

### Step 3: Install Frontend Dependencies
```powershell
npm --prefix frontend install
```

### Step 4: Configure Environment Variables
Copy `.env.example` to `.env`:
```powershell
cp .env.example .env
```

Key environment options:
- `DATABASE_URL`: `sqlite+aiosqlite:///./agentguard.db`
- `AI_PROVIDER`: `mock` (Set to `nemotron` if supplying an NVIDIA API key)
- `GITHUB_TOKEN`: **Optional**. Public repositories work with zero credentials.
- `SCAN_TIMEOUT_SECONDS`: `120` (Subprocess timeout per scanner)
- `FRONTEND_ORIGIN`: `http://localhost:5173`

---

## 6. Starting the Application

### Option A: Run Both Backend & Frontend Concurrently (Root)
```powershell
npm run dev
```

### Option B: Run Services in Separate Terminals

**Terminal 1 — Backend (FastAPI):**
```powershell
python -m uvicorn app.main:app --app-dir backend --reload --port 8000
```
- API Docs: [http://localhost:8000/api/docs](http://localhost:8000/api/docs)
- Health Check: [http://localhost:8000/health](http://localhost:8000/health)

**Terminal 2 — Frontend (Vite):**
```powershell
npm --prefix frontend run dev
```
- Web Application: [http://localhost:5173](http://localhost:5173)

---

## 7. How to Audit a Repository

1. Open **[http://localhost:5173](http://localhost:5173)**.
2. In the sidebar, navigate to **GitHub Repos** (or **New Audit**).
3. Paste any public GitHub repository URL:
   ```
   https://github.com/octocat/Hello-World
   ```
4. Click **Connect Repository**:
   - Validates URL syntax and rejects SSRF/path traversal attacks.
   - Queries GitHub's official REST API without tokens.
   - Pins HEAD commit SHA and performs safe tree inspection.
5. Click **Analyze Repository**:
   - Runs applicable scanners (Semgrep, Bandit, OSV-Scanner, detect-secrets).
   - Inspects the **Security Scanner Engine Matrix** showing engine status badges (`Available & Applicable`, `Skipped`, `Unavailable`).
   - Displays the **Partial Security Coverage Notice** if any applicable scanner was absent from the host PATH.
   - Filters findings by scanner source dropdown or severity.
6. Click **Download JSON Report** to export the structured audit report.

---

---

## 9. NVIDIA Nemotron & LangGraph Multi-Agent Security Audit

AgentGuard AI uses **LangGraph** to coordinate four specialized logical agents in an automated security audit pipeline powered by **NVIDIA Nemotron**:

```
           ┌───────────────────────────────────────────────┐
           │        Untrusted Repository Context           │
           │  (Size-limited, sanitized, redacted secrets)  │
           └───────────────────────┬───────────────────────┘
                                   │
                                   ▼
┌───────────────────┐    ┌───────────────────┐    ┌───────────────────┐    ┌─────────────────────┐
│ 1. Threat Modeler │ ─► │ 2. Test Strategist│ ─► │3. Evidence Analyst│ ─► │4. Remediation Verif.│
│ STRIDE / OWASP    │    │ Boundary Payloads │    │ Actual Findings   │    │ Actionable Fixes    │
│ Attack Surfaces   │    │ Test Specifications│    │ Evidence Grounding│    │ Verification Gates  │
└───────────────────┘    └───────────────────┘    └───────────────────┘    └─────────────────────┘
```

### The Four Logical Agents
1. **Threat Modeler**: Inspects the software architecture, programming languages, package manifests, and configuration files. Classifies architectural risks according to STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) and maps exposed attack surfaces.
2. **Test Strategist**: Formulates verification test cases, fuzzing boundaries, attack payloads, and automated test scripts (e.g. pytest, curl) designed to prove or disprove exploitability of the threat model.
3. **Evidence Analyst**: Forensic reviewer evaluating **actual scanner findings** (from Semgrep, Bandit, OSV-Scanner, and detect-secrets). Validates that code evidence directly substantiates each issue, filters false positives, and assigns exploitability ratings.
4. **Remediation Verifier**: Generates safe code remediations (Before -> After) and defines **Mandatory Verification Criteria**.

### Strict Security & Governance Policies
- **Untrusted Input Isolation**: All repository text, file trees, and manifests are enclosed in XML delimiters (`<untrusted_repo_context>` and `<actual_scanner_findings>`). The system prompts strictly instruct the LLM to treat all enclosed text as untrusted data and ignore prompt injection attempts or policy overrides.
- **No Command Execution**: Agents have zero execution privileges. They cannot invoke shell commands, execute scripts, or alter files.
- **Evidence-Grounded Verification**: Agents are strictly forbidden from declaring vulnerabilities or fixes as "verified" without concrete proof. Findings without direct evidence default to `"unverified"`. Remediation fixes remain `"unverified"` until verification test assertions are executed.
- **Size-Limited Context & Redaction**: Input context is truncated to safe character limits and stripped of all detected credentials before submission to the LLM.
- **Optional AI & Seamless Fallback**: If `NVIDIA_API_KEY` is not provided or `AI_PROVIDER=mock`, the application executes deterministic heuristic multi-agent analysis without breaking. If network calls fail or time out, fallback results are returned gracefully.

### Supported NVIDIA Endpoints & Models
- **API Endpoint**: `https://integrate.api.nvidia.com/v1/chat/completions` (OpenAI-compatible)
- **Supported Models**:
  - `nvidia/llama-3.1-nemotron-70b-instruct` (Default recommended)
  - `nvidia/nemotron-4-340b-instruct`
- **Configuration (backend-only, in `.env`)**:
  ```bash
  AI_PROVIDER=nemotron
  AI_BASE_URL=https://integrate.api.nvidia.com/v1
  AI_API_KEY=nvapi-...
  AI_MODEL=nvidia/llama-3.1-nemotron-70b-instruct
  AI_TIMEOUT_SECONDS=60
  ```

---

## 10. Running Automated Tests

Run the full backend test suite (74 tests):
```powershell
python -m pytest backend/tests/ -v
```

Run LangGraph Multi-Agent tests:
```powershell
python -m pytest backend/tests/test_langgraph_agents.py -v
```

Run Real Scanner tests (applicability, timeouts, parsers, orchestrator):
```powershell
python -m pytest backend/tests/test_real_scanners.py -v
```

Run GitHub Integration & Security tests:
```powershell
python -m pytest backend/tests/test_github_security.py -v
```

Run Nemotron Client unit tests:
```powershell
python -m pytest backend/tests/test_nemotron.py -v
```

Validate Frontend TypeScript & Build:
```powershell
npm --prefix frontend run build
```

---

## 11. GitHub Authentication & App Integration Guidance

### Public Repositories
Zero tokens required. Requests are sent anonymously with official GitHub API headers (`Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`).

### Optional Fine-Grained Personal Access Token (PAT)
For higher rate limits (5,000 req/hr) or internal organization repositories:
1. Generate a read-only token in **GitHub Settings → Developer Settings → Personal Access Tokens → Fine-grained tokens**.
2. Restrict permissions to `Contents: Read-only` and `Metadata: Read-only`.
3. Add `GITHUB_TOKEN=github_pat_...` to `.env` (backend only).

### Recommended Production Architecture: GitHub App
For multi-tenant SaaS deployments:
- Register a GitHub App with read-only repository permissions.
- Use private RSA keys to generate short-lived (1-hour) installation access tokens.
- Secure private keys in AWS Secrets Manager or HashiCorp Vault.
