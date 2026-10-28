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
  ActiveScansResponse,
  Finding,
  FindingSolution,
  RepositorySolutionPlan,
  DashboardSummaryResponse,
  DashboardMetricsResponse,
  ScanComparisonResult,
} from '../types';

/**
 * Sanitize and normalize API Base URL:
 * - Strips duplicate protocols (e.g. "https://https://" -> "https://")
 * - Strips duplicate domain repetitions (e.g. ".onrender.com.onrender.com" -> ".onrender.com")
 * - Strips trailing slashes
 * - Upgrades insecure http to https when the page is served over https
 */
export function sanitizeApiBaseUrl(raw?: string): string {
  if (!raw) return '';
  let url = raw.trim();

  // Strip duplicate protocol prefixes (e.g., https://https:// or http://https://)
  url = url.replace(/^(https?:\/\/)+/gi, (match) => {
    return match.toLowerCase().includes('https') ? 'https://' : 'http://';
  });

  // Strip duplicate onrender domain suffixes (e.g., .onrender.com.onrender.com)
  url = url.replace(/(\.onrender\.com)+/gi, '.onrender.com');

  // Strip trailing slashes
  url = url.replace(/\/+$/, '');

  // If missing protocol but contains a domain dot, prefix https://
  if (!/^https?:\/\//i.test(url) && url.includes('.')) {
    url = `https://${url}`;
  }

  // Enforce HTTPS if page is loaded via HTTPS
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http://')) {
    url = url.replace(/^http:\/\//, 'https://');
  }

  return url;
}

const isVercelDeploy = typeof window !== 'undefined' && (
  window.location.hostname.endsWith('vercel.app') ||
  window.location.hostname.includes('vercel')
);

// Determine base URL:
// On Vercel, the built-in vercel.json rewrite proxy (/api/* -> Render backend) guarantees zero-CORS,
// low latency, and immunity to browser cross-origin blocks.
// If VITE_API_BASE_URL points to render.com (or was malformed/duplicate), prefer "" on Vercel.
// Only use an explicit URL if pointing to a non-render external server.
const rawEnvBase = import.meta.env.VITE_API_BASE_URL;
let resolvedBase: string;

if (isVercelDeploy) {
  if (rawEnvBase && !rawEnvBase.includes('onrender.com') && !rawEnvBase.includes('https://https://')) {
    resolvedBase = sanitizeApiBaseUrl(rawEnvBase);
  } else {
    resolvedBase = '';
  }
} else if (rawEnvBase !== undefined && rawEnvBase.trim() !== '') {
  resolvedBase = sanitizeApiBaseUrl(rawEnvBase);
} else {
  resolvedBase = 'https://agent-guard-ai.onrender.com';
}

export const API_BASE_URL = resolvedBase;
const BASE = API_BASE_URL;

// Eager non-blocking warm-up ping for Render free-tier sleeping instances
if (typeof window !== 'undefined') {
  setTimeout(() => {
    try {
      const pingUrl = (API_BASE_URL || '') + '/health';
      fetch(pingUrl, { method: 'GET', keepalive: true }).catch(() => {});
    } catch {
      // Ignore background warm-up errors
    }
  }, 150);
}

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

    list: (page = 1, pageSize = 50): Promise<RepositoryListResponse> =>
      client.get('/api/repositories', { params: { page, page_size: pageSize } }).then(r => r.data),

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

    listByRepo: (repositoryId: number, limit = 50, offset = 0): Promise<Scan[]> =>
      client.get(`/api/repositories/${repositoryId}/scans`, { params: { limit, offset } }).then(r => r.data),

    getActive: (signal?: AbortSignal): Promise<ActiveScansResponse> =>
      client.get('/api/scans/active', { timeout: 10000, signal }).then(r => r.data),

    cancelAll: (): Promise<{ cancelled_count: number; cancelled_scan_ids: number[]; message: string }> =>
      client.post('/api/scans/active/cancel-all').then(r => r.data),
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
    getSummary: (options?: { timeout?: number; signal?: AbortSignal }): Promise<DashboardSummaryResponse> =>
      client.get('/api/dashboard/summary', { timeout: options?.timeout ?? 15000, signal: options?.signal }).then(r => r.data),

    getMetrics: (options?: { timeout?: number; signal?: AbortSignal }): Promise<DashboardMetricsResponse> =>
      client.get('/api/dashboard/metrics', { timeout: options?.timeout ?? 15000, signal: options?.signal }).then(r => r.data),
  },

  findings: {
    list: (params?: {
      repository_id?: number;
      severity?: string;
      scanner?: string;
      verification_status?: string;
      page?: number;
      page_size?: number;
    }): Promise<{
      total: number;
      page: number;
      page_size: number;
      pages: number;
      repository_count: number;
      findings: Finding[];
      repositories: { id: number; name: string; full_name: string; url: string }[];
    }> =>
      client.get('/api/findings', { params }).then(r => r.data),

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

