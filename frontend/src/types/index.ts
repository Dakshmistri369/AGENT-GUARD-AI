/** Shared TypeScript types for AgentGuard AI frontend */

export interface Project {
  id: number;
  owner_id: number;
  name: string;
  description: string | null;
  language: string | null;
  framework: string | null;
  source_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectListResponse {
  items: Project[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded';
  version: string;
  environment: string;
  database: {
    status: 'ok' | 'error';
    type: string;
    latency_ms: number;
    error_type?: string;
  };
  ai_provider: {
    mode: string;
    mock_active: boolean;
  };
}

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface RepositoryMetadata {
  owner: string;
  name: string;
  default_branch: string;
  pinned_sha: string | null;
  file_count: number;
  directory_count: number;
  languages: string[];
  extensions: string[];
  manifests: string[];
  test_directories: string[];
  config_files: string[];
  workflow_files: string[];
  size_kb: number;
  is_incomplete: boolean;
  description?: string;
}

export interface Repository {
  id: number;
  owner_id: number;
  name: string;
  owner_name: string;
  full_name: string;
  url: string;
  default_branch: string;
  pinned_sha: string | null;
  is_private: boolean;
  metadata_json: RepositoryMetadata | null;
  created_at: string;
  updated_at: string;
}

export interface RepositoryListResponse {
  items: Repository[];
  total: number;
}

export interface ValidateUrlResponse {
  valid: boolean;
  owner?: string;
  name?: string;
  normalized_url?: string;
  error?: string;
}

export interface Finding {
  id: number;
  scan_id: number;
  scanner: string;
  scanner_version: string | null;
  rule_id: string | null;
  title: string;
  severity: SeverityLevel;
  confidence: 'high' | 'medium' | 'low';
  file_path: string | null;
  line_number: number | null;
  column_number: number | null;
  sanitized_evidence: string | null;
  explanation: string | null;
  remediation: string | null;
  verification_status: string;
  commit_sha: string | null;
  fingerprint: string | null;
  created_at: string;
}

export interface ScanSummary {
  total_findings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  scanner_breakdown: Record<string, number>;
}

export interface Scan {
  id: number;
  repository_id: number | null;
  project_id: number | null;
  status: ScanStatus;
  stage: string | null;
  commit_sha: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  summary: ScanSummary | null;
  configuration: Record<string, any> | null;
  created_at: string;
}

export interface ScanReport {
  scan_id: number;
  repository_id: number | null;
  repository_url: string | null;
  repository_full_name: string | null;
  commit_sha: string | null;
  default_branch: string | null;
  status: string;
  stage: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  metadata: RepositoryMetadata | null;
  summary: ScanSummary;
  findings: Finding[];
  ai_analysis: Record<string, any> | null;
  scanners_run: Array<Record<string, any>>;
  coverage_summary?: {
    is_complete: boolean;
    applicable_scanners: string[];
    executed_scanners: string[];
    missing_scanners: string[];
    failed_scanners: string[];
    skipped_scanners: string[];
    notes: string[];
  } | null;
  scanner_matrix?: Record<string, {
    name: string;
    scanner_id: string;
    available: boolean;
    version: string | null;
    applicable: boolean;
    applicability_reason: string;
  }> | null;
  generated_at: string;
}
