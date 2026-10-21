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

const RAW_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  'https://agent-guard-ai.onrender.com';
let sanitizedBase = RAW_BASE.trim().replace(/\/+$/, '');
if (typeof window !== 'undefined' && window.location.protocol === 'https:' && sanitizedBase.startsWith('http://')) {
  sanitizedBase = sanitizedBase.replace(/^http:\/\//, 'https://');
}
export const API_BASE_URL = sanitizedBase;
const BASE = API_BASE_URL;

let authTokenGetter: (() => string | null | Promise<string | null>) | null = null;
export const setAuthTokenGetter = (getter: () => string | null | Promise<string | null>) => {
  authTokenGetter = getter;
};

const client = axios.create({
  baseURL: BASE,
  timeout: 300000, // 5 minutes for full static analysis and multi-engine cloning
  headers: { 'Content-Type': 'application/json' },
});

// Dynamic Supabase JWT bearer injection
client.interceptors.request.use(async (config) => {
  if (authTokenGetter) {
    try {
      const token = await authTokenGetter();
      if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (e) {
      console.warn('[AgentGuard API] Failed to retrieve auth token:', e);
    }
  }
  return config;
});

// Automatic resilience interceptor:
// If a browser extension, Brave Shield, or strict CORS policy blocks direct cross-origin calls to Render,
// automatically fallback to the same-origin Vercel rewrite proxy (relative path "").
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    const isNetworkErr = !error.response || (error.message && error.message.includes('Network Error'));
    if (isNetworkErr && config && !config._retriedWithProxy) {
      config._retriedWithProxy = true;
      if (config.baseURL && config.baseURL !== '') {
        console.warn(
          `[AgentGuard API] Direct call to ${config.baseURL} encountered Network Error. Retrying seamlessly via same-origin rewrite proxy...`
        );
        config.baseURL = '';
        return client(config);
      }
    }
    return Promise.reject(error);
  }
);

export const api = {
  auth: {
    status: (): Promise<{
      auth_mode: string;
      supabase_configured: boolean;
      supabase_url: string;
      supabase_publishable_key: string;
      demo_auth_enabled: boolean;
    }> => client.get('/api/auth/status').then(r => r.data),

    me: (): Promise<{
      id: number;
      email: string;
      supabase_user_id?: string;
      email_verified: boolean;
      auth_status: string;
      created_at: string;
    }> => client.get('/api/auth/me').then(r => r.data),
  },

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

