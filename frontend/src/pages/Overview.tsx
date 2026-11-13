import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Play,
  Clock,
  Code2,
  Cpu,
  CheckCircle2,
  XCircle,
  RefreshCw,
  GitBranch,
  X,
  FileCode,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { api, API_BASE_URL } from '../lib/api';
import { SummaryCard } from '../components/dashboard/SummaryCard';
import { ChartPanel } from '../components/dashboard/ChartPanel';
import { CriticalFindingRow } from '../components/dashboard/CriticalFindingRow';
import { ScannerStatus } from '../components/dashboard/ScannerStatus';
import type { CriticalIssueItem, DashboardSummaryResponse, ActiveScansResponse } from '../types';

function resolveCweIdentifier(cweOrRule?: string, category?: string, title?: string): string {
  const text = `${cweOrRule || ''} ${category || ''} ${title || ''}`.toLowerCase();
  const match = (cweOrRule || '').match(/CWE-\d+/i);
  if (match) return match[0].toUpperCase();
  if (text.includes('subprocess') || text.includes('command') || text.includes('b602') || text.includes('b603') || text.includes('shell')) return 'CWE-78';
  if (text.includes('sql') || text.includes('b608') || text.includes('injection')) return 'CWE-89';
  if (text.includes('secret') || text.includes('token') || text.includes('key') || text.includes('credential') || text.includes('b105')) return 'CWE-798';
  if (text.includes('xss') || text.includes('cross-site')) return 'CWE-79';
  if (text.includes('path') || text.includes('traversal')) return 'CWE-22';
  if (text.includes('pickle') || text.includes('deserial')) return 'CWE-502';
  if (text.includes('crypto') || text.includes('md5') || text.includes('b303')) return 'CWE-327';
  return cweOrRule && cweOrRule.startsWith('CWE') ? cweOrRule : 'CWE-78';
}

function formatScannerClassification(scanner?: string): { type: 'SAST' | 'SCA' | 'Secrets'; label: string; badgeColor: string } {
  const s = (scanner || '').toLowerCase();
  if (s.includes('osv')) {
    return { type: 'SCA', label: 'SCA · OSV', badgeColor: '#38bdf8' };
  }
  if (s.includes('bandit')) {
    return { type: 'SAST', label: 'SAST · Bandit AST', badgeColor: '#a855f7' };
  }
  if (s.includes('semgrep')) {
    return { type: 'SAST', label: 'SAST · Semgrep', badgeColor: '#00f0ff' };
  }
  if (s.includes('secret')) {
    return { type: 'Secrets', label: 'Secrets · detect-secrets', badgeColor: '#f43f5e' };
  }
  return { type: 'SAST', label: 'SAST · Core', badgeColor: '#10b981' };
}

export const OverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selectedIssue, setSelectedIssue] = useState<CriticalIssueItem | null>(null);
  const [updatingFindingId, setUpdatingFindingId] = useState<number | null>(null);
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);

  // Connected repositories list for scoping
  const { data: repoData } = useQuery({
    queryKey: ['repositoriesList'],
    queryFn: () => api.repositories.list(1, 100),
  });
  const repositories = repoData?.items ?? [];

  // Live background active scans polling (6s interval)
  const { data: activeScansData } = useQuery<ActiveScansResponse>({
    queryKey: ['activeScans'],
    queryFn: ({ signal }) => api.scans.getActive(signal),
    refetchInterval: 6_000,
  });
  const activeScans = activeScansData?.scans ?? [];

  // TanStack Query for live Dashboard Analytics scoped to user/repo with rapid invalidation
  const {
    data: summary,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useQuery<DashboardSummaryResponse>({
    queryKey: ['dashboardSummary', selectedRepoId],
    queryFn: async ({ signal }) => {
      return api.dashboard.getSummary({
        repoId: selectedRepoId,
        timeout: 15000,
        signal,
      });
    },
    staleTime: 5000,
    retry: 1,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });

  const isUnauthorized = Boolean(
    isError && (
      (error as any)?.response?.status === 401 ||
      (error as any)?.response?.status === 403 ||
      (error as any)?.message?.includes('401') ||
      (error as any)?.message?.includes('403')
    )
  );

  // Mutation to update finding verification status (e.g. mark False Positive)
  const statusMutation = useMutation({
    mutationFn: async ({
      findingId,
      status,
    }: {
      findingId: number;
      status: 'unverified' | 'confirmed' | 'resolved' | 'false_positive';
    }) => {
      setUpdatingFindingId(findingId);
      return api.findings.updateStatus(findingId, status);
    },
    onSuccess: (updatedFinding) => {
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });
      if (selectedIssue && selectedIssue.id === updatedFinding.id) {
        setSelectedIssue((prev) =>
          prev ? { ...prev, verification_status: updatedFinding.verification_status } : null
        );
      }
      setUpdatingFindingId(null);
    },
    onError: (err) => {
      console.error('Failed to update finding status:', err);
      setUpdatingFindingId(null);
    },
  });

  const handleStartScan = () => {
    if (selectedRepoId) {
      navigate(`/repositories?repoId=${selectedRepoId}&action=scan`);
    } else {
      navigate('/repositories?action=scan');
    }
  };

  const handleNewRepo = () => {
    navigate('/repositories?action=new');
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-7xl xl:max-w-screen-2xl mx-auto bg-transparent min-h-full pb-safe">
      {/* ── Page Header: Repository & Scope Filters with Single Action ──────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1
              style={{
                fontSize: '26px',
                fontWeight: 700,
                color: '#e3e2e6',
                letterSpacing: '-0.02em',
                lineHeight: 1.25,
                margin: 0,
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
            >
              Overview
            </h1>
            <span
              style={{
                fontSize: '10.5px',
                fontWeight: 600,
                color: '#a7fcfa',
                background: 'rgba(139, 223, 221, 0.1)',
                border: '1px solid rgba(139, 223, 221, 0.35)',
                padding: '2px 8px',
                borderRadius: '4px',
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Current Posture
            </span>
          </div>
          <p style={{ fontSize: '13px', color: '#bdc9c8', margin: '4px 0 0 0', lineHeight: 1.4, fontFamily: "'Inter', sans-serif" }}>
            Multi-engine AST security, dependency supply chain, and secret exposure monitor
          </p>
        </div>

        {/* Filters and Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Repository Scope Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label htmlFor="repo-scope-select" className="sr-only">Scope by Repository</label>
            <select
              id="repo-scope-select"
              value={selectedRepoId || ''}
              onChange={(e) => setSelectedRepoId(e.target.value ? Number(e.target.value) : null)}
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: '#e3e2e6',
                background: '#1b1b1f',
                border: '1px solid rgba(62, 73, 72, 0.5)',
                borderRadius: '4px',
                padding: '6px 12px',
                cursor: 'pointer',
                outline: 'none',
                maxWidth: '220px',
                fontFamily: "'Inter', sans-serif",
              }}
              aria-label="Filter overview by connected repository"
            >
              <option value="" style={{ background: '#1b1b1f', color: '#bdc9c8' }}>All Repositories ({repositories.length})</option>
              {repositories.map((repo) => (
                <option key={repo.id} value={repo.id} style={{ background: '#1b1b1f', color: '#e3e2e6' }}>
                  {repo.full_name || repo.name}
                </option>
              ))}
            </select>
          </div>

          {/* Last updated indicator */}
          <div
            style={{
              display: 'none',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              color: '#889392',
              background: '#1b1b1f',
              border: '1px solid rgba(62, 73, 72, 0.4)',
              padding: '6px 10px',
              borderRadius: '4px',
              fontFamily: "'JetBrains Mono', monospace",
            }}
            className="md:flex"
            title="Timestamp of latest metrics refresh"
          >
            <Clock size={12} color="#8bdfdd" />
            <span>
              {dataUpdatedAt ? `Updated ${new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Live'}
            </span>
          </div>

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              padding: '6px 12px',
              borderRadius: '4px',
              background: '#1b1b1f',
              border: '1px solid rgba(62, 73, 72, 0.45)',
              color: '#e3e2e6',
              fontFamily: "'Space Grotesk', sans-serif",
            }}
            title="Refresh overview metrics"
            aria-label="Refresh overview metrics"
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{isFetching ? 'Updating…' : 'Refresh'}</span>
          </button>

          <button
            onClick={handleStartScan}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              padding: '6px 14px',
              borderRadius: '4px',
              background: '#8bdfdd',
              color: '#00201f',
              fontWeight: 700,
              fontFamily: "'Space Grotesk', sans-serif",
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 0 12px rgba(139, 223, 221, 0.35)',
              transition: 'all 0.15s ease',
            }}
            title="Start automated security audit"
          >
            <Play size={13} fill="#00201f" color="#00201f" />
            <span>Run Scan</span>
          </button>
        </div>
      </div>

      {/* ── Demo Mode Indicator Banner ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '10px 16px',
          borderRadius: '4px',
          background: 'rgba(27, 27, 31, 0.75)',
          border: '1px solid rgba(62, 73, 72, 0.4)',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            className="pulse-glow-cyan"
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: '#8bdfdd',
              boxShadow: '0 0 8px rgba(139, 223, 221, 0.8)',
            }}
          />
          <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#a7fcfa', fontFamily: "'JetBrains Mono', monospace" }}>
            Demo Mode Active
          </span>
          <span style={{ fontSize: '12px', color: '#bdc9c8', fontFamily: "'Inter', sans-serif" }}>
            — Direct web app access enabled. Private repositories and credentials remain protected.
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '10.5px',
              fontWeight: 600,
              color: '#8bdfdd',
              background: 'rgba(139, 223, 221, 0.12)',
              border: '1px solid rgba(139, 223, 221, 0.3)',
              borderRadius: '2px',
              padding: '2px 8px',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Zero-Login Direct Dashboard
          </span>
        </div>
      </div>

      {/* ── Active Background Scans Live Banner ── */}
      {activeScans.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            padding: '12px 16px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.04) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            marginBottom: '20px',
            boxShadow: '0 2px 6px rgba(16, 185, 129, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span
                className="animate-ping"
                style={{
                  position: 'absolute',
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.6)',
                }}
              />
              <RefreshCw size={18} className="animate-spin text-emerald-600" style={{ position: 'relative' }} />
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#065f46', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{activeScans.length} Background Scan{activeScans.length > 1 ? 's' : ''} Active</span>
                <span
                  style={{
                    fontSize: '11px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#34d399',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    padding: '1px 7px',
                    borderRadius: '9999px',
                    fontWeight: 600,
                  }}
                >
                  Live arq Engine
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#047857', marginTop: '2px' }}>
                {activeScans.map((s) => `${s.repository_name} (${s.stage ? s.stage.replace(/_/g, ' ') : s.status})`).join(' • ')}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => navigate('/repositories?tab=history')}
              className="btn btn-secondary"
              style={{
                fontSize: '11.5px',
                padding: '6px 12px',
                color: '#10b981',
                borderColor: 'rgba(16, 185, 129, 0.35)',
                background: 'rgba(16, 185, 129, 0.12)',
                fontWeight: 600,
              }}
            >
              View Scan Pipeline →
            </button>
          </div>
        </div>
      )}

      {/* ── Error Banner or Demo Notice ── */}
      {isError && (() => {
        const is401 = (error as any)?.response?.status === 401 || (error as any)?.message?.includes('401');
        const healthPingUrl = API_BASE_URL ? `${API_BASE_URL}/health` : '/health';
        return (
          <div
            style={{
              padding: '14px 20px',
              borderRadius: '10px',
              background: is401 ? 'rgba(56, 189, 248, 0.12)' : 'rgba(244, 63, 94, 0.12)',
              border: `1px solid ${is401 ? 'rgba(56, 189, 248, 0.25)' : 'rgba(244, 63, 94, 0.35)'}`,
              color: is401 ? '#38bdf8' : '#fb7185',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              marginBottom: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {is401 ? <ShieldAlert size={18} color="#00f0ff" /> : <XCircle size={18} color="#f43f5e" />}
                <span style={{ fontSize: '13px', fontWeight: 600 }}>
                  {is401
                    ? 'Viewing AgentGuard AI in Enterprise Evaluation Scope. Connect Supabase to sync private repositories and customized alerts.'
                    : `Connecting to AgentGuard security cluster: ${error instanceof Error ? error.message : 'Backend unreachable'}`}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <a
                  href={healthPingUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#00f0ff',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    textDecoration: 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <ExternalLink size={12} />
                  Ping Backend Health ↗
                </a>
                <button
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="btn btn-secondary"
                  style={{ fontSize: '11px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
                  {isFetching ? 'Retrying...' : 'Retry'}
                </button>
              </div>
            </div>
            <div style={{ fontSize: '11.5px', color: '#94a3b8', marginLeft: '28px', lineHeight: 1.4 }}>
              ⚡ <strong>Enterprise Telemetry:</strong> Microservices operate under autonomous worker orchestration with automated health watchdog loops and persistent connection pools.
            </div>
          </div>
        );
      })()}

      {/* ── Top Row: 4 Metric Cards with Obsidian Sentinel Surfaces ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          title="Open Findings"
          value={isError ? '—' : (summary?.potential_issues.count ?? 0)}
          subtext={
            isError
              ? isUnauthorized ? 'Authentication required for private findings' : 'Unable to load finding metrics'
              : selectedRepoId
              ? 'Active findings detected in latest scan of selected repository'
              : 'Active findings detected across latest scans of all repositories'
          }
          accentColor="#8bdfdd"
          bgColor="#1b1b1f"
          borderColor="rgba(62, 73, 72, 0.45)"
          badge={
            !isError && summary && summary.potential_issues.count > 0
              ? `${summary.severity_distribution.critical} Crit · ${summary.severity_distribution.high} High`
              : 'Clean'
          }
          badgeColor={(summary?.severity_distribution.critical ?? 0) > 0 ? '#ffb4ab' : '#8bdfdd'}
          onClick={() => navigate('/repositories?tab=findings')}
          isLoading={isLoading && !summary}
        />

        <SummaryCard
          title="Critical & High"
          value={
            isError
              ? '—'
              : ((summary?.severity_distribution.critical ?? 0) + (summary?.severity_distribution.high ?? 0))
          }
          subtext={
            isError
              ? 'Severity breakdown unavailable'
              : ((summary?.severity_distribution.critical ?? 0) + (summary?.severity_distribution.high ?? 0)) > 0
              ? 'High-priority vulnerabilities requiring immediate code remediation'
              : 'Zero critical or high severity vulnerabilities detected'
          }
          accentColor="#ffb4ab"
          bgColor="#1b1b1f"
          borderColor="rgba(62, 73, 72, 0.45)"
          badge={
            ((summary?.severity_distribution.critical ?? 0) + (summary?.severity_distribution.high ?? 0)) > 0
              ? 'Action Required'
              : 'None'
          }
          badgeColor={
            ((summary?.severity_distribution.critical ?? 0) + (summary?.severity_distribution.high ?? 0)) > 0
              ? '#ffb4ab'
              : '#8bdfdd'
          }
          onClick={() => navigate('/repositories?tab=findings&severity=critical')}
          isLoading={isLoading && !summary}
        />

        <SummaryCard
          title="Repositories Needing Attention"
          value={
            isError
              ? '—'
              : (summary?.issues_by_repository.filter((r) => r.total > 0).length ?? 0)
          }
          subtext={
            isError
              ? 'Repository posture unavailable'
              : `Out of ${summary?.issues_by_repository.length ?? repositories.length} connected repositories in scope`
          }
          accentColor="#ffb4a6"
          bgColor="#1b1b1f"
          borderColor="rgba(62, 73, 72, 0.45)"
          badge={
            (summary?.issues_by_repository.filter((r) => r.total > 0).length ?? 0) > 0
              ? `${summary?.issues_by_repository.filter((r) => r.total > 0).length} Affected`
              : 'All Clear'
          }
          badgeColor={
            (summary?.issues_by_repository.filter((r) => r.total > 0).length ?? 0) > 0
              ? '#ffb4a6'
              : '#8bdfdd'
          }
          onClick={() => navigate('/repositories')}
          isLoading={isLoading && !summary}
        />

        <SummaryCard
          title="Scan Coverage"
          value={isError ? '—' : `${summary?.metrics.total_files_scanned ?? 0} files`}
          subtext={
            isError
              ? 'Coverage metrics unavailable'
              : `${summary?.scans_and_reviews.total_scans ?? 0} total scans completed across Semgrep, Bandit, secrets & OSV`
          }
          accentColor="#a7fcfa"
          bgColor="#1b1b1f"
          borderColor="rgba(62, 73, 72, 0.45)"
          badge="4 Engines"
          badgeColor="#8bdfdd"
          onClick={() => navigate('/repositories?tab=history')}
          isLoading={isLoading && !summary}
        />
      </div>

      {/* ── Middle Row: 3 Chart Panels on Cyber Glass Surfaces ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        {/* Card 1: Issues By Vulnerability Type (Donut Chart) */}
        <ChartPanel
          title="Issues By Vulnerability Type"
          infoTooltip="Distribution of security findings grouped by CWE and scanner rule categories."
        >
          {isLoading && !summary ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '240px' }}>
              <div className="animate-spin" style={{ width: '28px', height: '28px', border: '3px solid #cbd5e1', borderTopColor: '#2563eb', borderRadius: '50%' }} />
            </div>
          ) : isError && !summary ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px', color: '#cbd5e1', textAlign: 'center', padding: '0 16px' }}>
              <ShieldAlert size={32} color="#d97706" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>Metrics Unavailable</div>
              <div style={{ fontSize: '12px', color: '#cbd5e1', maxWidth: '280px', marginTop: '4px', marginBottom: '12px' }}>
                {isUnauthorized
                  ? 'Vulnerability distributions require authorized access or active demo workspace scans.'
                  : (error instanceof Error ? error.message : 'Unable to retrieve vulnerability metrics from backend service.')}
              </div>
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="btn btn-secondary"
                style={{ fontSize: '11px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
                {isFetching ? 'Retrying...' : 'Retry'}
              </button>
            </div>
          ) : !summary || summary.vulnerability_types.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px', color: '#cbd5e1' }}>
              <CheckCircle2 size={32} color="#059669" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
                {summary && summary.scans_and_reviews.total_scans > 0
                  ? 'No Findings in Completed Checks'
                  : 'Not Scanned Yet'}
              </div>
              <div style={{ fontSize: '12px', textAlign: 'center', maxWidth: '280px', marginTop: '4px', color: '#cbd5e1' }}>
                {summary && summary.scans_and_reviews.total_scans > 0
                  ? 'Security engines detected zero vulnerabilities in the completed check scope.'
                  : 'Run your first audit to analyze code for AST flaws and vulnerable dependencies.'}
              </div>
              {(!summary || summary.scans_and_reviews.total_scans === 0) && (
                <button onClick={handleStartScan} className="btn btn-secondary" style={{ fontSize: '11px', padding: '4px 10px', marginTop: '8px' }}>
                  Run First Scan
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center justify-between sm:h-[240px] gap-4 py-2">
              {/* Donut graphic */}
              <div style={{ width: '180px', height: '180px', position: 'relative', flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div
                              style={{
                                background: 'rgba(10, 18, 32, 0.95)',
                                border: '1px solid rgba(56, 189, 248, 0.3)',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                              }}
                            >
                              <div style={{ fontWeight: 700, color: '#ffffff' }}>{data.name}</div>
                              <div style={{ color: '#00f0ff', fontWeight: 600, marginTop: '2px' }}>
                                {data.count} issues ({data.percentage}%)
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Pie
                      data={summary.vulnerability_types}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={78}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {summary.vulnerability_types.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend with Crisp White Fonts */}
              <div
                className="grid grid-cols-2 gap-x-3 gap-y-2 flex-1 w-full sm:pl-3"
              >
                {summary.vulnerability_types.map((vt) => (
                  <div key={vt.name} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                    <span
                      style={{
                        width: '8px',
                        height: '14px',
                        borderRadius: '2px',
                        background: vt.color,
                        flexShrink: 0,
                        marginTop: '2px',
                      }}
                    />
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#ffffff', lineHeight: 1.1 }}>
                        {vt.short_name}
                      </div>
                      <div style={{ fontSize: '10.5px', color: '#00f0ff', marginTop: '1px', fontWeight: 600 }}>
                        {vt.percentage}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartPanel>

        {/* Card 2: Issues By Severity (Stacked Bar Chart) */}
        <ChartPanel
          title="Issues By Severity"
          infoTooltip="Total security findings categorized by standard CVSS / scanner severity levels."
        >
          {isLoading && !summary ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '240px' }}>
              <div className="animate-spin" style={{ width: '28px', height: '28px', border: '3px solid #cbd5e1', borderTopColor: '#2563eb', borderRadius: '50%' }} />
            </div>
          ) : isError && !summary ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px', color: '#cbd5e1', textAlign: 'center', padding: '0 16px' }}>
              <ShieldAlert size={32} color="#d97706" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>Severity Breakdown Unavailable</div>
              <div style={{ fontSize: '12px', color: '#cbd5e1', maxWidth: '280px', marginTop: '4px', marginBottom: '12px' }}>
                {isUnauthorized
                  ? 'Severity metrics require authorized access or active demo workspace scans.'
                  : (error instanceof Error ? error.message : 'Backend service offline or unreachable.')}
              </div>
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="btn btn-secondary"
                style={{ fontSize: '11px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
                {isFetching ? 'Retrying...' : 'Retry'}
              </button>
            </div>
          ) : !summary || summary.severity_distribution.total === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px', color: '#cbd5e1' }}>
              <CheckCircle2 size={32} color="#059669" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
                {summary && summary.scans_and_reviews.total_scans > 0
                  ? 'No Findings Detected'
                  : 'Not Scanned Yet'}
              </div>
              <div style={{ fontSize: '12px', textAlign: 'center', maxWidth: '280px', marginTop: '4px', color: '#cbd5e1' }}>
                {summary && summary.scans_and_reviews.total_scans > 0
                  ? 'No open critical, high, medium, or low findings recorded in latest scan scope.'
                  : 'Start an audit to generate a severity breakdown across your codebase.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '240px', padding: '0 8px' }}>
              {/* Stacked Horizontal Bar */}
              <div
                style={{
                  height: '24px',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  display: 'flex',
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  marginBottom: '24px',
                }}
              >
                {summary.severity_distribution.critical > 0 && (
                  <div
                    style={{
                      width: `${(summary.severity_distribution.critical / summary.severity_distribution.total) * 100}%`,
                      background: '#e11d48',
                      transition: 'width 0.4s ease',
                    }}
                    title={`Critical: ${summary.severity_distribution.critical}`}
                  />
                )}
                {summary.severity_distribution.high > 0 && (
                  <div
                    style={{
                      width: `${(summary.severity_distribution.high / summary.severity_distribution.total) * 100}%`,
                      background: '#d97706',
                      transition: 'width 0.4s ease',
                    }}
                    title={`High: ${summary.severity_distribution.high}`}
                  />
                )}
                {summary.severity_distribution.medium > 0 && (
                  <div
                    style={{
                      width: `${(summary.severity_distribution.medium / summary.severity_distribution.total) * 100}%`,
                      background: '#2563eb',
                      transition: 'width 0.4s ease',
                    }}
                    title={`Medium: ${summary.severity_distribution.medium}`}
                  />
                )}
                {summary.severity_distribution.low > 0 && (
                  <div
                    style={{
                      width: `${(summary.severity_distribution.low / summary.severity_distribution.total) * 100}%`,
                      background: '#059669',
                      transition: 'width 0.4s ease',
                    }}
                    title={`Low: ${summary.severity_distribution.low}`}
                  />
                )}
                {summary.severity_distribution.info > 0 && (
                  <div
                    style={{
                      width: `${(summary.severity_distribution.info / summary.severity_distribution.total) * 100}%`,
                      background: '#94a3b8',
                      transition: 'width 0.4s ease',
                    }}
                    title={`Info: ${summary.severity_distribution.info}`}
                  />
                )}
              </div>

              {/* Severity Legend & Counts with Crisp White Fonts */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '14px', borderRadius: '2px', background: '#e11d48' }} />
                  <div>
                    <div style={{ fontSize: '11px', color: '#ffffff', opacity: 0.9, fontWeight: 600 }}>Critical</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff' }}>{summary.severity_distribution.critical}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '14px', borderRadius: '2px', background: '#d97706' }} />
                  <div>
                    <div style={{ fontSize: '11px', color: '#ffffff', opacity: 0.9, fontWeight: 600 }}>High</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff' }}>{summary.severity_distribution.high}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '14px', borderRadius: '2px', background: '#2563eb' }} />
                  <div>
                    <div style={{ fontSize: '11px', color: '#ffffff', opacity: 0.9, fontWeight: 600 }}>Medium</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff' }}>{summary.severity_distribution.medium}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '14px', borderRadius: '2px', background: '#059669' }} />
                  <div>
                    <div style={{ fontSize: '11px', color: '#ffffff', opacity: 0.9, fontWeight: 600 }}>Low</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff' }}>{summary.severity_distribution.low}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '14px', borderRadius: '2px', background: '#94a3b8' }} />
                  <div>
                    <div style={{ fontSize: '11px', color: '#ffffff', opacity: 0.9, fontWeight: 600 }}>Info</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff' }}>{summary.severity_distribution.info}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </ChartPanel>

        {/* Card 3: Scanner Health & Coverage */}
        <ChartPanel
          title="Scanner Health & Coverage"
          infoTooltip="Live operational status of configured static scanners, package analyzers, and secret detectors."
        >
          <ScannerStatus
            scanners={summary?.scanner_health ?? []}
            isLoading={isLoading && !summary}
            isError={isError && !summary}
            errorMessage={error instanceof Error ? error.message : undefined}
            onRetry={() => refetch()}
          />
        </ChartPanel>
      </div>

      {/* ── Bottom Row: 3 Widget Panels with Black Fonts ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Card 1: Metrics (Time Saved & Automated Split) */}
        <ChartPanel
          title="Metrics"
          infoTooltip="Calculated engineer hours saved through automated AST scanners and precision patch generation."
        >
          {isLoading && !summary ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '240px' }}>
              <div className="animate-spin" style={{ width: '28px', height: '28px', border: '3px solid #cbd5e1', borderTopColor: '#2563eb', borderRadius: '50%' }} />
            </div>
          ) : isError && !summary ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px', color: '#cbd5e1', textAlign: 'center', padding: '0 16px' }}>
              <Clock size={32} color="#94a3b8" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>Metrics Unavailable</div>
              <div style={{ fontSize: '12px', color: '#cbd5e1', maxWidth: '280px', marginTop: '4px', marginBottom: '12px' }}>
                {error instanceof Error ? error.message : 'Unable to query efficiency and time-saved metrics.'}
              </div>
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="btn btn-secondary"
                style={{ fontSize: '11px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
                {isFetching ? 'Retrying...' : 'Retry'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '240px', justifyContent: 'space-between', padding: '12px 8px' }}>
              {/* Primary Time Saved Metric */}
              <div style={{ textAlign: 'center', marginTop: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#ffffff', opacity: 0.9, fontSize: '13px', marginBottom: '4px', fontWeight: 600 }}>
                  <Clock size={16} color="#00f0ff" />
                  <span>Total Time Saved</span>
                </div>
                <div
                  style={{
                    fontSize: '44px',
                    fontWeight: 800,
                    color: '#ffffff',
                    letterSpacing: '-1px',
                    lineHeight: 1.1,
                  }}
                >
                  {isError ? '—' : `${summary?.metrics.total_time_saved_hours ?? 0}`}
                  <span style={{ fontSize: '24px', fontWeight: 600, color: '#00f0ff', marginLeft: '4px' }}>h</span>
                </div>
              </div>

              {/* Split breakdown: Logic vs Traditional/Automated */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-around',
                  paddingTop: '16px',
                  borderTop: '1px solid rgba(56, 189, 248, 0.2)',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: '#ffffff', opacity: 0.9, fontSize: '11.5px', marginBottom: '2px', fontWeight: 600 }}>
                    <Code2 size={13} color="#2dd4bf" />
                    <span>Logic</span>
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#ffffff' }}>
                    {isError ? '—' : `${summary?.metrics.logic_hours ?? 0}h`}
                  </div>
                </div>

                <div style={{ width: '1px', height: '32px', background: 'rgba(56, 189, 248, 0.2)' }} />

                <div style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: '#ffffff', opacity: 0.9, fontSize: '11.5px', marginBottom: '2px', fontWeight: 600 }}>
                    <Cpu size={13} color="#c084fc" />
                    <span>Traditional</span>
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#ffffff' }}>
                    {isError ? '—' : `${summary?.metrics.traditional_hours ?? 0}h`}
                  </div>
                </div>
              </div>
            </div>
          )}
        </ChartPanel>

        {/* Card 2: Most Critical Issues */}
        <ChartPanel
          title="Most Critical Issues"
          infoTooltip="Highest severity security findings requiring immediate attention or automated patch review."
          action={
            <button
              onClick={() => navigate('/repositories?tab=findings')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#2563eb',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              View all
            </button>
          }
        >
          {isLoading && !summary ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 0' }}>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="animate-pulse"
                  style={{
                    height: '52px',
                    borderRadius: '8px',
                    background: 'rgba(15, 23, 42, 0.85)',
                    border: '1px solid rgba(56, 189, 248, 0.15)',
                  }}
                />
              ))}
            </div>
          ) : isError && !summary ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px', color: '#cbd5e1', textAlign: 'center', padding: '0 16px' }}>
              <ShieldAlert size={32} color="#d97706" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>Critical Findings Unavailable</div>
              <div style={{ fontSize: '12px', color: '#cbd5e1', maxWidth: '280px', marginTop: '4px', marginBottom: '12px' }}>
                {isUnauthorized
                  ? 'Private repository findings are protected. Authorized access required.'
                  : (error instanceof Error ? error.message : 'Unable to query critical security findings.')}
              </div>
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="btn btn-secondary"
                style={{ fontSize: '11px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
                {isFetching ? 'Retrying...' : 'Retry'}
              </button>
            </div>
          ) : !summary || summary.most_critical_issues.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px', color: '#cbd5e1' }}>
              <CheckCircle2 size={32} color="#059669" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
                {summary && summary.scans_and_reviews.total_scans > 0 ? 'No Critical Findings' : 'Not Scanned Yet'}
              </div>
              <div style={{ fontSize: '12px', textAlign: 'center', maxWidth: '280px', marginTop: '4px', color: '#cbd5e1' }}>
                {summary && summary.scans_and_reviews.total_scans > 0
                  ? 'Repositories in current scope have no open critical vulnerabilities.'
                  : 'Run an audit to detect code flaws, secret exposures, and CVEs.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', maxHeight: '280px' }}>
              {summary.most_critical_issues.map((issue) => (
                <CriticalFindingRow
                  key={issue.id}
                  issue={issue}
                  onClick={(iss) => setSelectedIssue(iss)}
                />
              ))}
            </div>
          )}
        </ChartPanel>

        {/* Card 3: Issues By Repository */}
        <ChartPanel
          title="Issues By Repository"
          infoTooltip="Comparative vulnerability breakdown for each connected GitHub repository."
          action={
            <button
              onClick={() => navigate('/repositories')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#38bdf8',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Manage repos
            </button>
          }
        >
          {isLoading && !summary ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 0' }}>
              {[1, 2].map((i) => (
                <div key={i} className="animate-pulse" style={{ height: '56px', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.1)' }} />
              ))}
            </div>
          ) : isError && !summary ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px', color: '#cbd5e1', textAlign: 'center', padding: '0 16px' }}>
              <GitBranch size={32} color="#94a3b8" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>Repositories Inaccessible</div>
              <div style={{ fontSize: '12px', color: '#cbd5e1', maxWidth: '280px', marginTop: '4px', marginBottom: '12px' }}>
                {isUnauthorized
                  ? 'Private repository list is protected. Sign-in required for private audits.'
                  : (error instanceof Error ? error.message : 'Unable to connect to repository registry.')}
              </div>
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="btn btn-secondary"
                style={{ fontSize: '11px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
                {isFetching ? 'Retrying...' : 'Retry'}
              </button>
            </div>
          ) : !summary || summary.issues_by_repository.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px', color: '#cbd5e1' }}>
              <GitBranch size={32} color="#00f0ff" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>No Repositories Connected</div>
              <div style={{ fontSize: '12px', marginBottom: '12px', color: '#cbd5e1' }}>Connect a repository to audit findings.</div>
              <button onClick={handleNewRepo} className="btn btn-primary" style={{ fontSize: '12px' }}>
                Connect Repository
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto', maxHeight: '280px' }}>
              {summary.issues_by_repository.map((repo) => (
                <div
                  key={repo.repository_id}
                  onClick={() => navigate(`/repositories?repoId=${repo.repository_id}`)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'rgba(10, 18, 32, 0.7)',
                    border: '1px solid rgba(56, 189, 248, 0.2)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#00f0ff';
                    e.currentTarget.style.background = 'rgba(15, 25, 45, 0.85)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.2)';
                    e.currentTarget.style.background = 'rgba(10, 18, 32, 0.7)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <GitBranch size={14} color="#00f0ff" />
                      <span>{repo.repository_name}</span>
                    </div>
                    <span style={{ fontSize: '11.5px', color: '#00f0ff', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
                      {repo.total} issues
                    </span>
                  </div>

                  {/* Repository Mini Stacked Bar */}
                  <div
                    style={{
                      height: '8px',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      display: 'flex',
                      background: 'rgba(56, 189, 248, 0.12)',
                    }}
                  >
                    {repo.total === 0 ? (
                      <div style={{ width: '100%', background: '#059669' }} title="Clean" />
                    ) : (
                      <>
                        {repo.critical > 0 && (
                          <div style={{ width: `${(repo.critical / repo.total) * 100}%`, background: '#e11d48' }} />
                        )}
                        {repo.high > 0 && (
                          <div style={{ width: `${(repo.high / repo.total) * 100}%`, background: '#d97706' }} />
                        )}
                        {repo.medium > 0 && (
                          <div style={{ width: `${(repo.medium / repo.total) * 100}%`, background: '#2563eb' }} />
                        )}
                        {repo.low > 0 && (
                          <div style={{ width: `${(repo.low / repo.total) * 100}%`, background: '#059669' }} />
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartPanel>
      </div>

      {/* ── Finding Detail & False Positive Review Drawer/Modal ─────────────────── */}
      {selectedIssue && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '12px',
          }}
          onClick={() => setSelectedIssue(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '680px',
              background: 'rgba(6, 12, 22, 0.96)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(56, 189, 248, 0.28)',
              borderRadius: '14px',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.7), 0 0 25px rgba(0, 240, 255, 0.15)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="issue-detail-title"
          >
            {/* Modal Header */}
            <div
              className="px-4 py-3 sm:px-6 sm:py-4"
              style={{
                borderBottom: '1px solid rgba(56, 189, 248, 0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    background:
                      selectedIssue.severity === 'critical'
                        ? 'rgba(244, 63, 94, 0.15)'
                        : 'rgba(245, 158, 11, 0.15)',
                    color: selectedIssue.severity === 'critical' ? '#fb7185' : '#fcd34d',
                    border: `1px solid ${selectedIssue.severity === 'critical' ? 'rgba(244, 63, 94, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
                  }}
                >
                  {selectedIssue.severity}
                </span>
                {(() => {
                  const rawScore = selectedIssue.score ?? 90;
                  const cvss = rawScore > 10 ? (rawScore / 10).toFixed(1) : Number(rawScore).toFixed(1);
                  return (
                    <span style={{ fontSize: '13px', color: '#cbd5e1' }}>
                      CVSS v3.1: <strong style={{ color: '#00f0ff', fontFamily: 'JetBrains Mono, monospace' }}>{cvss} / 10.0</strong>
                    </span>
                  );
                })()}
              </div>

              <button
                onClick={() => setSelectedIssue(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '6px',
                  minWidth: '40px',
                  minHeight: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto flex flex-col gap-4">
              <div>
                <h3 id="issue-detail-title" style={{ fontSize: '17px', fontWeight: 800, color: '#f8fafc', lineHeight: 1.3 }}>
                  {selectedIssue.title}
                </h3>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                  Repository:{' '}
                  <span style={{ color: '#00f0ff', fontWeight: 700 }}>{selectedIssue.repository_name}</span>
                </div>
              </div>

              {/* Location metadata */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '10px',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: 'rgba(10, 18, 32, 0.7)',
                  border: '1px solid rgba(56, 189, 248, 0.18)',
                  fontSize: '12px',
                }}
              >
                <div>
                  <div style={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 600 }}>Scanner Engine & Scope</div>
                  <div style={{ color: '#ffffff', fontWeight: 700, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: 'rgba(15, 23, 42, 0.9)',
                        color: formatScannerClassification(selectedIssue.scanner).badgeColor,
                        border: `1px solid ${formatScannerClassification(selectedIssue.scanner).badgeColor}40`,
                        fontWeight: 700,
                      }}
                    >
                      {formatScannerClassification(selectedIssue.scanner).label}
                    </span>
                  </div>
                </div>
                <div>
                  <div style={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 600 }}>CWE Identifier & Rule</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#00f0ff',
                        background: 'rgba(0, 240, 255, 0.12)',
                        border: '1px solid rgba(0, 240, 255, 0.3)',
                        padding: '1px 6px',
                        borderRadius: '4px',
                      }}
                    >
                      {resolveCweIdentifier(selectedIssue.cwe_or_rule, selectedIssue.category, selectedIssue.title)}
                    </span>
                    <span style={{ color: '#94a3b8', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px' }}>
                      {selectedIssue.cwe_or_rule}
                    </span>
                  </div>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 600 }}>File & Line Location</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                    <div style={{ color: '#ffffff', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
                      {selectedIssue.file_path || 'source_code'}
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        background: 'rgba(56, 189, 248, 0.12)',
                        color: '#38bdf8',
                        border: '1px solid rgba(56, 189, 248, 0.25)',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontWeight: 700,
                        fontFamily: 'JetBrains Mono, monospace',
                      }}
                    >
                      Line {selectedIssue.line_number || 1}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status & Review State */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background:
                    selectedIssue.verification_status === 'false_positive'
                      ? 'rgba(16, 185, 129, 0.12)'
                      : 'rgba(56, 189, 248, 0.12)',
                  border: `1px solid ${
                    selectedIssue.verification_status === 'false_positive' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(56, 189, 248, 0.25)'
                  }`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Current Verification Status</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', textTransform: 'capitalize' }}>
                    {selectedIssue.verification_status.replace('_', ' ')}
                  </div>
                </div>

                {/* Mark False Positive or Revert Buttons */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {selectedIssue.verification_status === 'false_positive' ? (
                    <button
                      onClick={() =>
                        statusMutation.mutate({ findingId: selectedIssue.id, status: 'unverified' })
                      }
                      disabled={updatingFindingId === selectedIssue.id}
                      className="btn btn-secondary"
                      style={{ fontSize: '11px', padding: '5px 12px' }}
                    >
                      {updatingFindingId === selectedIssue.id ? 'Updating…' : 'Revert to Open'}
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        statusMutation.mutate({ findingId: selectedIssue.id, status: 'false_positive' })
                      }
                      disabled={updatingFindingId === selectedIssue.id}
                      className="btn btn-secondary"
                      style={{
                        fontSize: '11px',
                        padding: '5px 12px',
                        borderColor: 'rgba(16, 185, 129, 0.5)',
                        color: '#34d399',
                        fontWeight: 600,
                      }}
                    >
                      {updatingFindingId === selectedIssue.id ? 'Marking…' : 'Mark as False Positive'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '14px 24px',
                borderTop: '1px solid rgba(56, 189, 248, 0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(6, 12, 22, 0.98)',
              }}
            >
              <button
                onClick={() => {
                  const fId = selectedIssue.id;
                  setSelectedIssue(null);
                  navigate(`/repositories?tab=solutions&findingId=${fId}`);
                }}
                className="btn btn-primary"
                style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <FileCode size={14} />
                <span>View Exact Fix Patch</span>
              </button>

              <button
                onClick={() => setSelectedIssue(null)}
                className="btn btn-secondary"
                style={{ fontSize: '12px' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
