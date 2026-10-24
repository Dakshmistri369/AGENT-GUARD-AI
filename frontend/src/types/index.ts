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
  line_end?: number | null;
  column_number: number | null;
  code_snippet?: string | null;
  location_type?: string | null;
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
  files_discovered?: number;
  files_scanned?: number;
  files_skipped?: number;
  skip_manifest?: Record<string, any> | null;
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
  files_discovered?: number;
  files_scanned?: number;
  files_skipped?: number;
  skip_manifest?: Record<string, any> | null;
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
    files_discovered?: number;
    files_scanned?: number;
    files_skipped?: number;
    skip_manifest?: Record<string, any> | null;
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

export type SolutionType = 'code_diff' | 'dependency_upgrade' | 'secret_removal' | 'security_config';

export interface FindingSolution {
  finding_id: number;
  title: string;
  severity: SeverityLevel;
  scanner: string;
  rule_id: string | null;
  file_path: string | null;
  line_number: number | null;
  solution_type: SolutionType;
  action_summary: string;
  cli_command: string | null;
  before_code: string | null;
  after_code: string | null;
  diff: string | null;
  explanation: string;
  verification_step: string;
  is_automated_patch: boolean;
  model_used?: string | null;
}

export interface FileSolutionGroup {
  file_path: string;
  findings_count: number;
  solutions: FindingSolution[];
  combined_patch: string | null;
}

export interface RepositorySolutionPlan {
  scan_id: number;
  repository_id: number | null;
  total_solutions: number;
  code_diffs_count: number;
  dependency_upgrades_count: number;
  secret_removals_count: number;
  quick_fix_cli_commands: string[];
  file_groups: FileSolutionGroup[];
  full_unified_patch: string | null;
  solutions: FindingSolution[];
}

export interface ScansSummaryMetrics {
  total_scans: number;
  scans_last_30_days: number;
  pr_reviews: number;
}

export interface FalsePositivesMetrics {
  count: number;
  total_issues: number;
  percentage: number;
}

export interface PotentialIssuesMetrics {
  count: number;
  total_issues: number;
}

export interface PatchesGeneratedMetrics {
  count: number;
  total_issues: number;
  percentage: number;
}

export interface VulnerabilityTypeSlice {
  name: string;
  short_name: string;
  count: number;
  percentage: number;
  color: string;
}

export interface SeverityDistribution {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
}

export interface CriticalIssueItem {
  id: number;
  scan_id: number;
  repository_id?: number | null;
  repository_name?: string | null;
  title: string;
  category: string;
  cwe_or_rule: string;
  severity: SeverityLevel;
  score: number;
  file_path: string | null;
  line_number: number | null;
  scanner: string;
  verification_status: string;
  created_at: string;
}

export interface RepositoryIssueBreakdown {
  repository_id: number;
  repository_name: string;
  default_branch: string;
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface ScannerHealthItem {
  name: string;
  engine_key: string;
  status: 'healthy' | 'operational' | 'fallback' | 'unavailable';
  version?: string | null;
  last_run_at?: string | null;
  findings_count: number;
  description: string;
}

export interface OverallMetrics {
  total_time_saved_hours: number;
  logic_hours: number;
  traditional_hours: number;
  total_files_scanned: number;
  total_repositories: number;
}

export interface RecentScanItem {
  id: number;
  repository_id?: number | null;
  repository_name: string;
  branch?: string | null;
  commit_sha?: string | null;
  status: ScanStatus;
  findings_count: number;
  created_at: string;
  completed_at?: string | null;
}

export interface DashboardSummaryResponse {
  scans_and_reviews: ScansSummaryMetrics;
  false_positives: FalsePositivesMetrics;
  potential_issues: PotentialIssuesMetrics;
  patches_generated: PatchesGeneratedMetrics;
  vulnerability_types: VulnerabilityTypeSlice[];
  severity_distribution: SeverityDistribution;
  most_critical_issues: CriticalIssueItem[];
  issues_by_repository: RepositoryIssueBreakdown[];
  scanner_health: ScannerHealthItem[];
  metrics: OverallMetrics;
  recent_activity: RecentScanItem[];
}

export interface ScanComparisonResult {
  scan_a: {
    id: number;
    commit_sha?: string | null;
    created_at: string;
    total_findings: number;
  };
  scan_b: {
    id: number;
    commit_sha?: string | null;
    created_at: string;
    total_findings: number;
  };
  new_findings: Finding[];
  resolved_findings: Finding[];
  persistent_findings: Finding[];
  delta: number;
}

