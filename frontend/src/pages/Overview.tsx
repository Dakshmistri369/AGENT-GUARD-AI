import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Shield,
  FolderOpen,
  Activity,
  Cpu,
  AlertCircle,
  CheckCircle,
  XCircle,
  ArrowRight,
  GitBranch,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { api } from '../lib/api';
import type { HealthStatus, ProjectListResponse, Repository, Scan } from '../types';

// ── Stat Card ────────────────────────────────────────────────────────────────
const StatCard: React.FC<{
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent?: string;
}> = ({ label, value, sub, icon, accent = 'var(--electric-blue)' }) => (
  <div className="stat-card animate-slide-in" style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
    <div
      style={{
        width: '40px',
        height: '40px',
        borderRadius: '10px',
        background: `${accent}22`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        border: `1px solid ${accent}44`,
      }}
      aria-hidden="true"
    >
      {icon}
    </div>
    <div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
        {value}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{label}</div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{sub}</div>}
    </div>
  </div>
);

// ── DB Status row ─────────────────────────────────────────────────────────────
const DbStatusRow: React.FC<{ health: HealthStatus }> = ({ health }) => {
  const ok = health.database.status === 'ok';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
      {ok ? (
        <CheckCircle size={14} color="var(--accent-green)" aria-hidden="true" />
      ) : (
        <XCircle size={14} color="var(--accent-rose)" aria-hidden="true" />
      )}
      <span style={{ color: ok ? 'var(--accent-green)' : 'var(--accent-rose)' }}>
        {ok ? 'Database connected' : `Database error: ${health.database.error_type ?? 'unknown'}`}
      </span>
      <span style={{ color: 'var(--text-muted)' }}>·</span>
      <span style={{ color: 'var(--text-muted)' }}>{health.database.type}</span>
      <span style={{ color: 'var(--text-muted)' }}>·</span>
      <span style={{ color: 'var(--text-muted)' }}>{health.database.latency_ms} ms</span>
    </div>
  );
};

// ── Main Overview Page ────────────────────────────────────────────────────────
export const OverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [projects, setProjects] = useState<ProjectListResponse | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repoScans, setRepoScans] = useState<Record<number, Scan[]>>({});

  const [healthErr, setHealthErr] = useState<string | null>(null);
  const [projectsErr, setProjectsErr] = useState<string | null>(null);
  const [reposErr, setReposErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOverviewData = async () => {
    setLoading(true);
    setHealthErr(null);
    setProjectsErr(null);
    setReposErr(null);

    try {
      const [hRes, pRes, rRes] = await Promise.all([
        api.health.get().catch((e) => {
          setHealthErr(e.message);
          return null;
        }),
        api.projects.list(1, 1).catch((e) => {
          setProjectsErr(e.message);
          return null;
        }),
        api.repositories.list().catch((e) => {
          setReposErr(e.message);
          return null;
        }),
      ]);

      if (hRes) setHealth(hRes);
      if (pRes) setProjects(pRes);
      if (rRes) {
        setRepositories(rRes.items);

        // Fetch past scans for up to 10 repos to calculate real metrics
        const scansMap: Record<number, Scan[]> = {};
        await Promise.all(
          rRes.items.slice(0, 10).map(async (repo) => {
            try {
              const scans = await api.scans.listByRepo(repo.id);
              scansMap[repo.id] = scans;
            } catch (err) {
              console.warn(`Could not load scans for repo ${repo.id}:`, err);
            }
          })
        );
        setRepoScans(scansMap);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverviewData();
  }, []);

  // Compute live aggregate stats from real scan records
  let totalCompletedScans = 0;
  let totalFindingsAcrossRepos = 0;
  let activeScansCount = 0;

  Object.values(repoScans).forEach((scans) => {
    scans.forEach((scan) => {
      if (scan.status === 'completed') {
        totalCompletedScans += 1;
        if (scan.summary?.total_findings) {
          totalFindingsAcrossRepos += scan.summary.total_findings;
        }
      } else if (scan.status === 'running') {
        activeScansCount += 1;
      }
    });
  });

  return (
    <div style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: '#040d1a',
              border: '1px solid rgba(45, 212, 191, 0.4)',
              boxShadow: '0 0 20px rgba(20, 184, 166, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            <img
              src="/logo-icon.png"
              alt="AgentGuard AI Logo"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
                AgentGuard AI
              </h1>
              <span
                className="mock-label"
                style={{
                  background: 'rgba(20, 184, 166, 0.15)',
                  color: 'var(--teal-bright)',
                  borderColor: 'rgba(20, 184, 166, 0.3)',
                }}
              >
                Security Auditor
              </span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', maxWidth: '640px', marginTop: '4px' }}>
              Independent security and quality auditor for AI-generated and human-written software. Connect repositories, run multi-engine scans, and review evidence.
            </p>
          </div>
        </div>

        <button
          onClick={fetchOverviewData}
          disabled={loading}
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
          aria-label="Refresh dashboard metrics"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh Status
        </button>
      </div>

      {/* System Status */}
      <section style={{ marginBottom: '28px' }} aria-labelledby="system-status-heading">
        <h2
          id="system-status-heading"
          style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px' }}
        >
          System & Engine Status
        </h2>
        <div className="glass-card" style={{ padding: '16px 20px' }}>
          {loading && (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="animate-spin" style={{ width: '14px', height: '14px', border: '2px solid var(--border)', borderTopColor: 'var(--electric-blue)', borderRadius: '50%' }} />
              Checking system health & backend connectivity…
            </div>
          )}
          {!loading && healthErr && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-rose)', fontSize: '13px' }} role="alert">
              <XCircle size={14} />
              Cannot reach backend API: {healthErr}
            </div>
          )}
          {!loading && health && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {health.status === 'healthy' ? (
                  <CheckCircle size={14} color="var(--accent-green)" />
                ) : (
                  <AlertCircle size={14} color="var(--accent-amber)" />
                )}
                <span style={{ fontSize: '13px', fontWeight: 600, color: health.status === 'healthy' ? 'var(--accent-green)' : 'var(--accent-amber)' }}>
                  {health.status === 'healthy' ? 'All backend security services operational' : 'Degraded — check database connection'}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)' }}>
                  v{health.version} · {health.environment}
                </span>
              </div>
              <DbStatusRow health={health} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                <Cpu size={14} color={health.ai_provider.mock_active ? 'var(--accent-amber)' : 'var(--teal)'} />
                <span style={{ color: health.ai_provider.mock_active ? 'var(--accent-amber)' : 'var(--teal)' }}>
                  AI Engine: {health.ai_provider.mode.toUpperCase()}
                  {health.ai_provider.mock_active
                    ? ' (Mock/Fallback mode active when NVIDIA API key is omitted)'
                    : ' (NVIDIA Nemotron Active)'}
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Aggregate Live Stats */}
      <section style={{ marginBottom: '28px' }} aria-labelledby="live-metrics-heading">
        <h2
          id="live-metrics-heading"
          style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px' }}
        >
          Live Security Metrics
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
          <StatCard
            label="Total Projects"
            value={loading ? '—' : projectsErr ? 'Error' : (projects?.total ?? 0)}
            sub={projectsErr ? projectsErr : 'from live API'}
            icon={<FolderOpen size={18} color="var(--electric-blue)" />}
            accent="var(--electric-blue)"
          />
          <StatCard
            label="Connected Repositories"
            value={loading ? '—' : reposErr ? 'Error' : repositories.length}
            sub={reposErr ? reposErr : `${repositories.length} public/private connected`}
            icon={<GitBranch size={18} color="var(--teal)" />}
            accent="var(--teal)"
          />
          <StatCard
            label="Completed Audits"
            value={loading ? '—' : totalCompletedScans}
            sub={activeScansCount > 0 ? `${activeScansCount} scan in progress` : 'multi-engine static runs'}
            icon={<Activity size={18} color="var(--accent-purple)" />}
            accent="var(--accent-purple)"
          />
          <StatCard
            label="Total Findings Identified"
            value={loading ? '—' : totalFindingsAcrossRepos}
            sub={totalFindingsAcrossRepos === 0 ? 'Zero vulnerabilities identified' : 'from real scanner reports'}
            icon={<AlertCircle size={18} color="var(--accent-amber)" />}
            accent="var(--accent-amber)"
          />
        </div>
      </section>

      {/* Connected Repositories Section */}
      <section style={{ marginBottom: '28px' }} aria-labelledby="connected-repos-heading">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <h2
            id="connected-repos-heading"
            style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase' }}
          >
            Connected GitHub Repositories ({repositories.length})
          </h2>
          <Link to="/repositories" style={{ textDecoration: 'none' }}>
            <span style={{ fontSize: '12px', color: 'var(--electric-blue-bright)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Manage in Auditor <ArrowRight size={12} />
            </span>
          </Link>
        </div>

        {loading ? (
          <div className="glass-card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div className="animate-spin" style={{ width: '20px', height: '20px', border: '2px solid var(--border)', borderTopColor: 'var(--teal)', borderRadius: '50%', margin: '0 auto 10px' }} />
            Loading connected repositories...
          </div>
        ) : repositories.length === 0 ? (
          <div className="glass-card" style={{ padding: '36px 24px', textAlign: 'center' }}>
            <GitBranch size={36} color="var(--teal)" style={{ margin: '0 auto 12px', opacity: 0.8 }} />
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              No GitHub Repositories Connected Yet
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '480px', margin: '0 auto 18px' }}>
              Connect a GitHub repository to inspect manifests, pin commit SHAs, and run isolated static analyzers.
            </p>
            <Link to="/repositories" style={{ textDecoration: 'none' }}>
              <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <GitBranch size={14} />
                Connect First Repository
              </button>
            </Link>
          </div>
        ) : (
          <div className="glass-card" style={{ padding: '16px 20px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 12px' }}>Repository</th>
                  <th style={{ padding: '10px 12px' }}>Branch</th>
                  <th style={{ padding: '10px 12px' }}>Pinned SHA</th>
                  <th style={{ padding: '10px 12px' }}>Files</th>
                  <th style={{ padding: '10px 12px' }}>Languages</th>
                  <th style={{ padding: '10px 12px' }}>Audits</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {repositories.map((repo) => {
                  const scans = repoScans[repo.id] || [];
                  const latestScan = scans[0];
                  const meta = repo.metadata_json;

                  return (
                    <tr
                      key={repo.id}
                      style={{
                        borderBottom: '1px solid rgba(30, 58, 110, 0.4)',
                        transition: 'background 0.15s',
                      }}
                    >
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <GitBranch size={14} color="var(--electric-blue-bright)" />
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{repo.full_name}</span>
                          <a
                            href={repo.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--text-muted)' }}
                            title="Open on GitHub"
                          >
                            <ExternalLink size={12} />
                          </a>
                        </div>
                      </td>
                      <td style={{ padding: '12px', color: 'var(--teal-bright)', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}>
                        {repo.default_branch}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <code
                          style={{
                            background: 'rgba(15, 32, 64, 0.8)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            border: '1px solid var(--border)',
                            color: 'var(--electric-blue-bright)',
                          }}
                        >
                          {repo.pinned_sha ? repo.pinned_sha.slice(0, 7) : 'Unpinned'}
                        </code>
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                        {meta?.file_count ?? 0} files
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {meta?.languages && meta.languages.length > 0 ? (
                            meta.languages.slice(0, 2).map((lang) => (
                              <span
                                key={lang}
                                style={{
                                  fontSize: '10px',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  background: 'rgba(59, 130, 246, 0.15)',
                                  color: 'var(--electric-blue-bright)',
                                }}
                              >
                                {lang}
                              </span>
                            ))
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px' }}>
                        {latestScan ? (
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background:
                                latestScan.status === 'completed'
                                  ? 'rgba(16, 185, 129, 0.15)'
                                  : latestScan.status === 'running'
                                  ? 'rgba(59, 130, 246, 0.15)'
                                  : 'rgba(244, 63, 94, 0.15)',
                              color:
                                latestScan.status === 'completed'
                                  ? 'var(--accent-green)'
                                  : latestScan.status === 'running'
                                  ? 'var(--electric-blue-bright)'
                                  : 'var(--accent-rose)',
                              fontWeight: 600,
                              textTransform: 'capitalize',
                            }}
                          >
                            {latestScan.status}
                            {latestScan.summary && ` (${latestScan.summary.total_findings} findings)`}
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Not scanned yet</span>
                        )}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <button
                          onClick={() => navigate(`/repositories?repoId=${repo.id}`)}
                          className="btn btn-secondary"
                          style={{ fontSize: '11px', padding: '4px 10px' }}
                        >
                          <Shield size={12} />
                          Audit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Quick actions */}
      <section style={{ marginTop: '28px' }} aria-labelledby="quick-actions-heading">
        <h2
          id="quick-actions-heading"
          style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px' }}
        >
          Quick Actions
        </h2>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Link to="/repositories" style={{ textDecoration: 'none' }}>
            <button className="btn btn-primary">
              <Shield size={14} />
              Open Security Auditor
              <ArrowRight size={12} />
            </button>
          </Link>
          <Link to="/projects" style={{ textDecoration: 'none' }}>
            <button className="btn btn-secondary">
              <FolderOpen size={14} />
              Manage Projects
            </button>
          </Link>
        </div>
      </section>
    </div>
  );
};

