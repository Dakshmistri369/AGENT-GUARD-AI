-- ==============================================================================
-- AgentGuard AI — Supabase Storage Buckets Migration
-- Migration: 20261031120001_create_storage_buckets.sql
-- Description: Configures private storage buckets (scan-reports, scan-logs, repo-snapshots),
--              enforces 25MB file limits and MIME constraints, and adds strict RLS policies.
-- ==============================================================================

-- 1. Create storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    (
        'scan-reports',
        'scan-reports',
        FALSE,
        26214400, -- 25 MB
        ARRAY[
            'application/pdf',
            'application/json',
            'text/html',
            'text/csv',
            'application/zip'
        ]::text[]
    ),
    (
        'scan-logs',
        'scan-logs',
        FALSE,
        26214400, -- 25 MB
        ARRAY[
            'text/plain',
            'application/json',
            'application/x-ndjson'
        ]::text[]
    ),
    (
        'repo-snapshots',
        'repo-snapshots',
        FALSE,
        26214400, -- 25 MB
        ARRAY[
            'text/plain',
            'application/json',
            'application/zip',
            'application/x-yaml',
            'text/yaml'
        ]::text[]
    )
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ==============================================================================
-- 2. STORAGE OBJECT ROW LEVEL SECURITY POLICIES
-- ==============================================================================

-- Ensure RLS is active on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 2.1 SELECT (Read): Authenticated users can view only their own user_id directory
DROP POLICY IF EXISTS "storage_objects_select_own" ON storage.objects;
CREATE POLICY "storage_objects_select_own" ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id IN ('scan-reports', 'scan-logs', 'repo-snapshots') AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- 2.2 INSERT (Upload): Authenticated users can upload only into their own user_id directory
DROP POLICY IF EXISTS "storage_objects_insert_own" ON storage.objects;
CREATE POLICY "storage_objects_insert_own" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id IN ('scan-reports', 'scan-logs', 'repo-snapshots') AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- 2.3 DELETE: Authenticated users can delete only objects within their own user_id directory
DROP POLICY IF EXISTS "storage_objects_delete_own" ON storage.objects;
CREATE POLICY "storage_objects_delete_own" ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id IN ('scan-reports', 'scan-logs', 'repo-snapshots') AND
    (storage.foldername(name))[1] = auth.uid()::text
);
