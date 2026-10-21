# AgentGuard AI — n8n Automation Architecture & Workflows

This directory contains importable n8n workflow definitions, node-by-node specifications, and verified backend endpoint bindings for AgentGuard AI autonomous security operations.

---

## 1. Verified Endpoint Compatibility Status

Every endpoint called by the n8n workflows has been implemented and verified with real `pytest` unit test execution in `backend/tests/test_n8n_automation_endpoints.py`:

| Endpoint | HTTP Method | Target Workflow | Status | Verification Proof |
| :--- | :--- | :--- | :--- | :--- |
| `/health` or `/api/health` | `GET` | Workflow 7 (Health Monitor) | ✅ **VERIFIED** | `test_n8n_health_endpoint_available` |
| `/api/projects` | `GET` | Workflow 6 (Scheduler trigger) | ✅ **VERIFIED** | `test_n8n_scheduled_projects_list` |
| `/api/projects/{id}/scans` | `POST` | Workflow 1 (New Scan trigger) | ✅ **VERIFIED** | `test_n8n_trigger_project_scan_success` |
| `/api/scans/{id}/status` | `GET` | Workflow 2 (Status polling loop) | ✅ **VERIFIED** | `test_n8n_scan_status_polling` |
| `/api/scans/{id}/results` | `GET` | Workflow 2/4 (Findings & coverage) | ✅ **VERIFIED** | `test_n8n_scan_results_summary_and_coverage` |
| `/api/scans/{id}/report` | `GET` | Workflow 5 (Report delivery) | ✅ **VERIFIED** | `test_n8n_scan_report_delivery` |
| `/api/scans/{id}/notifications-log` | `POST` | Workflow 4/8 (Audit log) | ✅ **VERIFIED** | `test_n8n_notifications_log_endpoint` |
| `/api/auth/me` | `GET` | Auth / Service JWT Check | ✅ **VERIFIED** | `backend/tests/test_auth.py` |

---

## 2. Packaged Workflow Files

1. **[`agentguard_new_scan_orchestration.json`](./agentguard_new_scan_orchestration.json)**:
   - Combines Workflows 1, 2, and 4 into a unified end-to-end automation.
   - **Safeguard Added**: Includes a max-poll iteration guard (counter limited to $\le 60$ iterations / 10 minutes) preventing runaway infinite polling loops.
   - Preserves deterministic vs. AI-estimated findings distinctions.
2. **[`agentguard_health_monitoring.json`](./agentguard_health_monitoring.json)**:
   - Workflow 7: Polls `/health` every 5 minutes.
   - Triggers Slack ops alert on status degradation or connection timeout.
3. **[`agentguard_error_handler.json`](./agentguard_error_handler.json)**:
   - Workflow 8: Dead-letter error workflow.
   - Automatically sanitizes and redacts Bearer tokens, API keys (`nvapi-*`, `sk-*`), and passwords before posting error diagnostics.

---

## 3. Required Credentials in n8n Credential Manager

Never hardcode credentials inside workflow JSON or node parameters:

| Credential Name | Credential Type | Description |
| :--- | :--- | :--- |
| `agentguardServiceJwt` | Header Auth | Dedicated automation service account Bearer token (`Authorization: Bearer <token>`). |
| `agentguardAutomationToken` | Custom Header Auth | Secret token sent in `X-AgentGuard-Automation-Token` header for webhook verification. |
| `SLACK_CRED_ID` | Slack OAuth2 API | Bot token scoped only to `#agentguard-security` and `#agentguard-ops`. |
| `GITHUB_WEBHOOK_SECRET` | Secret / Header | HMAC SHA-256 secret for validating inbound GitHub PR webhook signatures. |
| `GITHUB_APP_TOKEN` | Header Auth | Fine-grained token with `pull_requests:write` and `repo:status` scopes only. |

---

## 4. Required Environment Variables

Set these in your n8n environment or `.env` configuration:

```bash
AGENTGUARD_API_BASE=https://agent-guard-ai.onrender.com
FRONTEND_BASE=https://agentguard-ai-dun.vercel.app
SLACK_SECURITY_CHANNEL_ID=C0123456789
SLACK_OPS_CHANNEL_ID=C0987654321
```

---

## 5. Security & Grounding Rules

1. **Relay, Don't Fabricate**: n8n never computes risk scores, CVSS rankings, or gateway decisions (ALLOW/BLOCK). It strictly passes through what the backend computed deterministically or AI-labeled.
2. **Honest Copy**: Alerts explicitly separate deterministic scanner-confirmed findings from AI-estimated findings.
3. **Scan Coverage Transparency**: Scan coverage metrics (files discovered vs. files scanned vs. files skipped) are included in all scan summaries.
4. **Secret Redaction**: All webhook payloads, error messages, and logs are sanitized by the error handler before transmission.
