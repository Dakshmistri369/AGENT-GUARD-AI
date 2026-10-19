import axios from 'axios';
import type {
  Project,
  ProjectListResponse,
  HealthStatus,
  Repository,
  RepositoryListResponse,
  ValidateUrlResponse,
  Scan,
  ScanReport,
  Finding,
  FindingSolution,
  RepositorySolutionPlan,
  DashboardSummaryResponse,
  ScanComparisonResult,
} from '../types';

const RAW_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const BASE = RAW_BASE.replace(/\/+$/, '');

const client = axios.create({
  baseURL: BASE,
  timeout: 300000, // 5 minutes for full static analysis and multi-engine cloning
  headers: { 'Content-Type': 'application/json' },
});

export const api = {
  health: {
    get: (): Promise<HealthStatus> =>
      client.get('/health').then(r => r.data),
  },

  projects: {
    list: (page = 1, pageSize = 20): Promise<ProjectListResponse> =>
      client.get('/api/projects', { params: { page, page_size: pageSize } }).then(r => r.data),

    get: (id: number): Promise<Project> =>
      client.get(`/api/projects/${id}`).then(r => r.data),

    create: (data: { name: string; description?: string; language?: string; framework?: string }): Promise<Project> =>
      client.post('/api/projects', data).then(r => r.data),

    update: (id: number, data: Partial<Pick<Project, 'name' | 'description' | 'language' | 'framework'>>): Promise<Project> =>
      client.patch(`/api/projects/${id}`, data).then(r => r.data),

    delete: (id: number): Promise<void> =>
      client.delete(`/api/projects/${id}`).then(() => undefined),
  },

  repositories: {
    validate: (url: string): Promise<ValidateUrlResponse> =>
      client.post('/api/repositories/validate', { url }).then(r => r.data),

    connect: (url: string): Promise<Repository> =>
      client.post('/api/repositories', { url }).then(r => r.data),

    list: (): Promise<RepositoryListResponse> =>
      client.get('/api/repositories').then(r => r.data),

    get: (id: number): Promise<Repository> =>
      client.get(`/api/repositories/${id}`).then(r => r.data),

    delete: (id: number): Promise<void> =>
      client.delete(`/api/repositories/${id}`).then(() => undefined),
  },

  scans: {
    analyze: (repositoryId: number, options?: { metadata_only?: boolean; branch?: string }): Promise<Scan> =>
      client.post(`/api/repositories/${repositoryId}/analyze`, options ?? {}).then(r => r.data),

    get: (scanId: number): Promise<Scan> =>
      client.get(`/api/scans/${scanId}`).then(r => r.data),

    report: (scanId: number): Promise<ScanReport> =>
      client.get(`/api/scans/${scanId}/report`).then(r => r.data),

    cancel: (scanId: number): Promise<Scan> =>
      client.post(`/api/scans/${scanId}/cancel`).then(r => r.data),

    listByRepo: (repositoryId: number): Promise<Scan[]> =>
      client.get(`/api/repositories/${repositoryId}/scans`).then(r => r.data),
  },

  solutions: {
    getByScan: (scanId: number): Promise<RepositorySolutionPlan> =>
      client.get(`/api/scans/${scanId}/solutions`).then(r => r.data),

    getByFinding: (findingId: number): Promise<FindingSolution> =>
      client.get(`/api/findings/${findingId}/solution`).then(r => r.data),

    aiEnhance: (findingId: number): Promise<FindingSolution> =>
      client.post(`/api/findings/${findingId}/solution/ai-enhance`).then(r => r.data),

    getPatchUrl: (scanId: number): string =>
      `${BASE}/api/scans/${scanId}/solutions/patch`,
  },

  dashboard: {
    getSummary: (): Promise<DashboardSummaryResponse> =>
      client.get('/api/dashboard/summary').then(r => r.data),
  },

  findings: {
    updateStatus: (
      findingId: number,
      status: 'unverified' | 'confirmed' | 'resolved' | 'false_positive',
      notes?: string
    ): Promise<Finding> =>
      client.patch(`/api/findings/${findingId}/status`, { status, notes }).then(r => r.data),
  },

  compare: {
    scans: (scanA: number, scanB: number): Promise<ScanComparisonResult> =>
      client.get('/api/scans/compare', { params: { scan_a: scanA, scan_b: scanB } }).then(r => r.data),
  },
};

