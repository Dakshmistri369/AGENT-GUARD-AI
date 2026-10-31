-- ==============================================================================
-- AgentGuard AI — Supabase Database Schema Migration
-- Migration: 20261031120000_create_agentguard_schema.sql
-- Description: Creates profiles, repositories, scans, findings, scan_artifacts,
--              and scan_jobs with UUID keys, foreign key constraints, indexes,
--              triggers, and strict Row Level Security (RLS) policies.
-- ==============================================================================

-- 1. Enable pgcrypto / uuid-ossp for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 2. UPDATED_AT TRIGGER FUNCTION
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 3. TABLE DEFINITIONS
-- ==============================================================================

-- 3.1 PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    avatar_url TEXT,
    plan TEXT NOT NULL DEFAULT 'free',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.2 REPOSITORIES
CREATE TABLE IF NOT EXISTS public.repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    repo_url TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'github',
    default_branch TEXT NOT NULL DEFAULT 'main',
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_repositories_owner_repo_url UNIQUE (owner_id, repo_url)
);

-- 3.3 SCANS
CREATE TABLE IF NOT EXISTS public.scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id UUID NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    branch TEXT,
    commit_sha TEXT,
    scan_type TEXT DEFAULT 'full',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_seconds NUMERIC,
    error_message TEXT,
    summary JSONB DEFAULT '{}'::jsonb,
    scanner_versions JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.4 FINDINGS
CREATE TABLE IF NOT EXISTS public.findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id UUID NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    scanner TEXT NOT NULL CHECK (scanner IN ('semgrep', 'bandit', 'osv')),
    category TEXT,
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info', 'unknown')),
    rule_id TEXT,
    title TEXT,
    description TEXT,
    file_path TEXT,
    line_start INTEGER,
    line_end INTEGER,
    code_snippet TEXT,
    cwe TEXT,
    cve TEXT,
    package_name TEXT,
    package_version TEXT,
    fixed_version TEXT,
    confidence TEXT,
    ai_explanation TEXT,
    ai_impact TEXT,
    ai_remediation TEXT,
    ai_model TEXT,
    raw JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.5 SCAN ARTIFACTS
CREATE TABLE IF NOT EXISTS public.scan_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id UUID NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    artifact_type TEXT NOT NULL CHECK (artifact_type IN ('report', 'sarif', 'log', 'sbom', 'raw_output')),
    file_name TEXT NOT NULL,
    storage_bucket TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_size_bytes BIGINT,
    mime_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.6 SCAN JOBS
CREATE TABLE IF NOT EXISTS public.scan_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id UUID NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    arq_job_id TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 4. PERFORMANCE & LOOKUP INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS ix_repositories_owner_id ON public.repositories(owner_id);
CREATE INDEX IF NOT EXISTS ix_repositories_owner_repo_url ON public.repositories(owner_id, repo_url);

CREATE INDEX IF NOT EXISTS ix_scans_user_created ON public.scans(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_scans_repo_created ON public.scans(repository_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_scans_status ON public.scans(status);

CREATE INDEX IF NOT EXISTS ix_findings_scan_id ON public.findings(scan_id);
CREATE INDEX IF NOT EXISTS ix_findings_scan_severity ON public.findings(scan_id, severity);
CREATE INDEX IF NOT EXISTS ix_findings_scan_scanner ON public.findings(scan_id, scanner);
CREATE INDEX IF NOT EXISTS ix_findings_user_created ON public.findings(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_scan_artifacts_scan_id ON public.scan_artifacts(scan_id);
CREATE INDEX IF NOT EXISTS ix_scan_jobs_scan_id ON public.scan_jobs(scan_id);
CREATE INDEX IF NOT EXISTS ix_scan_jobs_arq_job_id ON public.scan_jobs(arq_job_id);

-- ==============================================================================
-- 5. AUTOMATIC UPDATED_AT TRIGGERS
-- ==============================================================================
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column();

DROP TRIGGER IF EXISTS trg_repositories_updated_at ON public.repositories;
CREATE TRIGGER trg_repositories_updated_at
BEFORE UPDATE ON public.repositories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column();

DROP TRIGGER IF EXISTS trg_scans_updated_at ON public.scans;
CREATE TRIGGER trg_scans_updated_at
BEFORE UPDATE ON public.scans
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column();

DROP TRIGGER IF EXISTS trg_scan_jobs_updated_at ON public.scan_jobs;
CREATE TRIGGER trg_scan_jobs_updated_at
BEFORE UPDATE ON public.scan_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column();

-- ==============================================================================
-- 6. AUTOMATIC USER PROFILE PROVISIONING TRIGGER
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, avatar_url, plan)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
        'free'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable RLS across all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_jobs ENABLE ROW LEVEL SECURITY;

-- 7.1 PROFILES POLICIES
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
FOR UPDATE USING (auth.uid() = id);

-- 7.2 REPOSITORIES POLICIES
DROP POLICY IF EXISTS "repositories_select_own" ON public.repositories;
CREATE POLICY "repositories_select_own" ON public.repositories
FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "repositories_insert_own" ON public.repositories;
CREATE POLICY "repositories_insert_own" ON public.repositories
FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "repositories_update_own" ON public.repositories;
CREATE POLICY "repositories_update_own" ON public.repositories
FOR UPDATE USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "repositories_delete_own" ON public.repositories;
CREATE POLICY "repositories_delete_own" ON public.repositories
FOR DELETE USING (auth.uid() = owner_id);

-- 7.3 SCANS POLICIES
DROP POLICY IF EXISTS "scans_select_own" ON public.scans;
CREATE POLICY "scans_select_own" ON public.scans
FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "scans_insert_own" ON public.scans;
CREATE POLICY "scans_insert_own" ON public.scans
FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
        SELECT 1 FROM public.repositories r
        WHERE r.id = repository_id AND r.owner_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "scans_update_own" ON public.scans;
CREATE POLICY "scans_update_own" ON public.scans
FOR UPDATE USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 7.4 FINDINGS POLICIES (Read-only for user; inserts/updates via backend service role)
DROP POLICY IF EXISTS "findings_select_own" ON public.findings;
CREATE POLICY "findings_select_own" ON public.findings
FOR SELECT USING (auth.uid() = user_id);

-- 7.5 SCAN ARTIFACTS POLICIES
DROP POLICY IF EXISTS "scan_artifacts_select_own" ON public.scan_artifacts;
CREATE POLICY "scan_artifacts_select_own" ON public.scan_artifacts
FOR SELECT USING (auth.uid() = user_id);

-- 7.6 SCAN JOBS POLICIES
DROP POLICY IF EXISTS "scan_jobs_select_own" ON public.scan_jobs;
CREATE POLICY "scan_jobs_select_own" ON public.scan_jobs
FOR SELECT USING (auth.uid() = user_id);
