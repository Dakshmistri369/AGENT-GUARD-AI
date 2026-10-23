-- =====================================================================
-- AgentGuard AI — Autonomous n8n Workflow Database Schema
-- Run this script in the Supabase SQL Editor or via psql to create
-- dedicated audit, PR gating, and health metrics tables for n8n.
-- =====================================================================

-- 1. Automation Audit Trail (Tracks every n8n workflow execution)
CREATE TABLE IF NOT EXISTS automation_audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workflow_name VARCHAR(128) NOT NULL,
    execution_id VARCHAR(64),
    scan_id INTEGER REFERENCES scans(id) ON DELETE SET NULL,
    event_type VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'success',
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_automation_audit_logs_user_id ON automation_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS ix_automation_audit_logs_workflow ON automation_audit_logs(workflow_name);
CREATE INDEX IF NOT EXISTS ix_automation_audit_logs_scan_id ON automation_audit_logs(scan_id);
CREATE INDEX IF NOT EXISTS ix_automation_audit_logs_created_at ON automation_audit_logs(created_at DESC);

-- 2. Automation Pull Request Gate Checks
CREATE TABLE IF NOT EXISTS automation_pr_checks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    repository_full_name VARCHAR(255) NOT NULL,
    pr_number INTEGER NOT NULL,
    commit_sha VARCHAR(64),
    scan_id INTEGER REFERENCES scans(id) ON DELETE SET NULL,
    decision VARCHAR(32) NOT NULL DEFAULT 'ALLOW', -- ALLOW | BLOCK | REQUIRE_APPROVAL
    critical_count INTEGER NOT NULL DEFAULT 0,
    high_count INTEGER NOT NULL DEFAULT 0,
    deterministic_count INTEGER NOT NULL DEFAULT 0,
    ai_estimated_count INTEGER NOT NULL DEFAULT 0,
    comment_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_automation_pr_checks_repo_pr ON automation_pr_checks(repository_full_name, pr_number);
CREATE INDEX IF NOT EXISTS ix_automation_pr_checks_commit ON automation_pr_checks(commit_sha);
CREATE INDEX IF NOT EXISTS ix_automation_pr_checks_created_at ON automation_pr_checks(created_at DESC);

-- 3. Automation Health History (Uptime & Latency Telemetry)
CREATE TABLE IF NOT EXISTS automation_health_history (
    id SERIAL PRIMARY KEY,
    endpoint VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL, -- healthy | degraded | unreachable
    latency_ms NUMERIC(10,2),
    database_connected BOOLEAN DEFAULT TRUE,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_automation_health_created_at ON automation_health_history(created_at DESC);

-- Enable Row Level Security (RLS) on all automation tables
ALTER TABLE automation_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_pr_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_health_history ENABLE ROW LEVEL SECURITY;

-- Default permissive policy for service account / authenticated pooler role
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'automation_audit_logs' AND policyname = 'allow_service_role_all'
    ) THEN
        CREATE POLICY allow_service_role_all ON automation_audit_logs FOR ALL USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'automation_pr_checks' AND policyname = 'allow_service_role_all'
    ) THEN
        CREATE POLICY allow_service_role_all ON automation_pr_checks FOR ALL USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'automation_health_history' AND policyname = 'allow_service_role_all'
    ) THEN
        CREATE POLICY allow_service_role_all ON automation_health_history FOR ALL USING (true);
    END IF;
END
$$;
