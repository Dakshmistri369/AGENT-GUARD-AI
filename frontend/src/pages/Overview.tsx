import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Play,
  Plus,
  Clock,
  Code2,
  Cpu,
  CheckCircle2,
  XCircle,
  RefreshCw,
  GitBranch,
  X,
  FileCode,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { api } from '../lib/api';
import { SummaryCard } from '../components/dashboard/SummaryCard';
import { ChartPanel } from '../components/dashboard/ChartPanel';
import { CriticalFindingRow } from '../components/dashboard/CriticalFindingRow';
import { ScannerStatus } from '../components/dashboard/ScannerStatus';
import type { CriticalIssueItem, DashboardSummaryResponse } from '../types';

export const OverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selectedIssue, setSelectedIssue] = useState<CriticalIssueItem | null>(null);
  const [updatingFindingId, setUpdatingFindingId] = useState<number | null>(null);

  // TanStack Query for live Dashboard Analytics
  const {
    data: summary,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<DashboardSummaryResponse>({
    queryKey: ['dashboardSummary'],
    queryFn: () => api.dashboard.getSummary(),
    refetchInterval: 30000, // automatic background refresh every 30s
  });

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
    navigate('/repositories?action=scan');
  };

  const handleNewRepo = () => {
    navigate('/repositories?action=new');
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1440px', margin: '0 auto', background: '#ffffff', minHeight: '100%' }}>
      {/* ── Page Header with Black Fonts ────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '28px',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '26px',
              fontWeight: 800,
              color: '#0f172a',
              letterSpacing: '-0.4px',
              lineHeight: 1.2,
            }}
          >
            Dashboard
          </h1>
          <p style={{ fontSize: '13px', color: '#475569', marginTop: '4px' }}>
            Multi-engine AST security, dependency supply chain, and secret exposure monitor
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', padding: '8px 12px' }}
            title="Refresh Dashboard metrics"
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={handleStartScan}
            className="btn btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12.5px',
              padding: '8px 14px',
              color: '#0f172a',
              fontWeight: 600,
            }}
          >
            <Play size={13} fill="#2563eb" color="#2563eb" />
            <span>Start Manual Scan</span>
          </button>

          <button
            onClick={handleNewRepo}
            className="btn btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12.5px',
              padding: '8px 16px',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
            }}
          >
            <Plus size={15} />
            <span>New Repository</span>
          </button>
        </div>
      </div>

      {/* ── Error Banner ────────────────────────────────────────────────────────── */}
      {isError && (
        <div
          style={{
            padding: '16px 20px',
            borderRadius: '10px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <XCircle size={18} />
            <span style={{ fontSize: '13px', fontWeight: 600 }}>
              Failed to load dashboard metrics: {error instanceof Error ? error.message : 'Backend unreachable'}
            </span>
          </div>
          <button
            onClick={() => refetch()}
            className="btn btn-secondary"
            style={{ fontSize: '11px', padding: '4px 10px' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Top Row: 4 Summary Cards with Different Background Colors & Black Fonts ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <SummaryCard
          title="Scans & Reviews"
          value={isLoading ? '—' : summary?.scans_and_reviews.total_scans ?? 0}
          subtext={
            isLoading
              ? 'Loading scan metrics…'
              : `${summary?.scans_and_reviews.pr_reviews ?? 0} PR reviews and ${
                  summary?.scans_and_reviews.scans_last_30_days ?? 0
                } full scans in the last 30 days`
          }
          accentColor="#2563eb"
          bgColor="#f0f7ff"
          borderColor="#bfdbfe"
          onClick={() => navigate('/repositories?tab=history')}
          isLoading={isLoading}
        />

        <SummaryCard
          title="False Positives"
          value={isLoading ? '—' : summary?.false_positives.count ?? 0}
          subtext={
            isLoading
              ? 'Loading review state…'
              : `Filtered ${summary?.false_positives.count ?? 0} false positives out of ${
                  summary?.false_positives.total_issues ?? 0
                } total issues.`
          }
          accentColor="#059669"
          bgColor="#f0fdf4"
          borderColor="#bbf7d0"
          badge={summary && summary.false_positives.percentage > 0 ? `${summary.false_positives.percentage}%` : undefined}
          badgeColor="#059669"
          onClick={() => navigate('/repositories?tab=findings')}
          isLoading={isLoading}
        />

        <SummaryCard
          title="Potential Issues"
          value={
            isLoading
              ? '—'
              : summary
              ? summary.potential_issues.count > 1000
                ? `${(summary.potential_issues.count / 1000).toFixed(1)}k`
                : summary.potential_issues.count
              : 0
          }
          subtext={
            isLoading
              ? 'Aggregating open findings…'
              : `Found ${summary?.potential_issues.count ?? 0} potential issues out of ${
                  summary?.potential_issues.total_issues ?? 0
                } total issues.`
          }
          accentColor="#d97706"
          bgColor="#fffbeb"
          borderColor="#fde68a"
          onClick={() => navigate('/repositories?tab=findings')}
          isLoading={isLoading}
        />

        <SummaryCard
          title="Patches generated"
          value={isLoading ? '—' : summary?.patches_generated.count ?? 0}
          subtext={
            isLoading
              ? 'Calculating remediation patches…'
              : `Generated patches for ${summary?.patches_generated.count ?? 0} out of ${
                  summary?.potential_issues.count ?? 0
                } potential issues`
          }
          accentColor="#7c3aed"
          bgColor="#faf5ff"
          borderColor="#e9d5ff"
          badge={summary && summary.patches_generated.percentage > 0 ? `${summary.patches_generated.percentage}%` : undefined}
          badgeColor="#7c3aed"
          onClick={() => navigate('/repositories?tab=solutions')}
          isLoading={isLoading}
        />
      </div>

      {/* ── Middle Row: 3 Chart Panels on White Card Backgrounds ─────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        {/* Card 1: Issues By Vulnerability Type (Donut Chart) */}
        <ChartPanel
          title="Issues By Vulnerability Type"
          infoTooltip="Distribution of security findings grouped by CWE and scanner rule categories."
        >
          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '240px' }}>
              <div className="animate-spin" style={{ width: '28px', height: '28px', border: '3px solid #cbd5e1', borderTopColor: '#2563eb', borderRadius: '50%' }} />
            </div>
          ) : !summary || summary.vulnerability_types.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px', color: '#64748b' }}>
              <CheckCircle2 size={32} color="#059669" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>No Issues Found</div>
              <div style={{ fontSize: '12px' }}>Your scanned codebases have zero reported vulnerabilities.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '240px' }}>
              {/* Donut graphic */}
              <div style={{ width: '180px', height: '200px', position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div
                              style={{
                                background: '#ffffff',
                                border: '1px solid #e2e8f0',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                              }}
                            >
                              <div style={{ fontWeight: 700, color: '#0f172a' }}>{data.name}</div>
                              <div style={{ color: '#0d9488', fontWeight: 600, marginTop: '2px' }}>
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

              {/* Legend with Black Fonts */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '8px 12px',
                  flex: 1,
                  paddingLeft: '12px',
                }}
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
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a', lineHeight: 1.1 }}>
                        {vt.short_name}
                      </div>
                      <div style={{ fontSize: '10.5px', color: '#475569', marginTop: '1px' }}>
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
          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '240px' }}>
              <div className="animate-spin" style={{ width: '28px', height: '28px', border: '3px solid #cbd5e1', borderTopColor: '#2563eb', borderRadius: '50%' }} />
            </div>
          ) : !summary || summary.severity_distribution.total === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px', color: '#64748b' }}>
              <CheckCircle2 size={32} color="#059669" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Zero Vulnerabilities</div>
              <div style={{ fontSize: '12px' }}>No critical, high, medium, or low findings recorded.</div>
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
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
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

              {/* Severity Legend & Counts with Black Fonts */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '14px', borderRadius: '2px', background: '#e11d48' }} />
                  <div>
                    <div style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>Critical</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>{summary.severity_distribution.critical}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '14px', borderRadius: '2px', background: '#d97706' }} />
                  <div>
                    <div style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>High</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>{summary.severity_distribution.high}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '14px', borderRadius: '2px', background: '#2563eb' }} />
                  <div>
                    <div style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>Medium</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>{summary.severity_distribution.medium}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '14px', borderRadius: '2px', background: '#059669' }} />
                  <div>
                    <div style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>Low</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>{summary.severity_distribution.low}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '14px', borderRadius: '2px', background: '#94a3b8' }} />
                  <div>
                    <div style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>Info</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>{summary.severity_distribution.info}</div>
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
          <ScannerStatus scanners={summary?.scanner_health ?? []} isLoading={isLoading} />
        </ChartPanel>
      </div>

      {/* ── Bottom Row: 3 Widget Panels with Black Fonts ────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Card 1: Metrics (Time Saved & Automated Split) */}
        <ChartPanel
          title="Metrics"
          infoTooltip="Calculated engineer hours saved through automated AST scanners and precision patch generation."
        >
          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '240px' }}>
              <div className="animate-spin" style={{ width: '28px', height: '28px', border: '3px solid #cbd5e1', borderTopColor: '#2563eb', borderRadius: '50%' }} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '240px', justifyContent: 'space-between', padding: '12px 8px' }}>
              {/* Primary Time Saved Metric */}
              <div style={{ textAlign: 'center', marginTop: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#475569', fontSize: '13px', marginBottom: '4px', fontWeight: 600 }}>
                  <Clock size={16} color="#2563eb" />
                  <span>Total Time Saved</span>
                </div>
                <div
                  style={{
                    fontSize: '44px',
                    fontWeight: 800,
                    color: '#0f172a',
                    letterSpacing: '-1px',
                    lineHeight: 1.1,
                  }}
                >
                  {summary?.metrics.total_time_saved_hours ?? 0}
                  <span style={{ fontSize: '24px', fontWeight: 600, color: '#475569', marginLeft: '4px' }}>h</span>
                </div>
              </div>

              {/* Split breakdown: Logic vs Traditional/Automated */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-around',
                  paddingTop: '16px',
                  borderTop: '1px solid #e2e8f0',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: '#475569', fontSize: '11.5px', marginBottom: '2px', fontWeight: 600 }}>
                    <Code2 size={13} color="#0d9488" />
                    <span>Logic</span>
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
                    {summary?.metrics.logic_hours ?? 0}h
                  </div>
                </div>

                <div style={{ width: '1px', height: '32px', background: '#e2e8f0' }} />

                <div style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: '#475569', fontSize: '11.5px', marginBottom: '2px', fontWeight: 600 }}>
                    <Cpu size={13} color="#7c3aed" />
                    <span>Traditional</span>
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
                    {summary?.metrics.traditional_hours ?? 0}h
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
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 0' }}>
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse" style={{ height: '52px', borderRadius: '8px', background: '#f1f5f9' }} />
              ))}
            </div>
          ) : !summary || summary.most_critical_issues.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px', color: '#64748b' }}>
              <CheckCircle2 size={32} color="#059669" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>No Critical Issues</div>
              <div style={{ fontSize: '12px' }}>All connected repositories are free of critical vulnerabilities.</div>
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
                color: '#2563eb',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Manage repos
            </button>
          }
        >
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 0' }}>
              {[1, 2].map((i) => (
                <div key={i} className="animate-pulse" style={{ height: '56px', borderRadius: '8px', background: '#f1f5f9' }} />
              ))}
            </div>
          ) : !summary || summary.issues_by_repository.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px', color: '#64748b' }}>
              <GitBranch size={32} color="#2563eb" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>No Repositories Connected</div>
              <div style={{ fontSize: '12px', marginBottom: '12px' }}>Connect a repository to audit findings.</div>
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
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#2563eb';
                    e.currentTarget.style.background = '#f1f5f9';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.background = '#f8fafc';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <GitBranch size={14} color="#0d9488" />
                      <span>{repo.repository_name}</span>
                    </div>
                    <span style={{ fontSize: '11.5px', color: '#334155', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
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
                      background: '#e2e8f0',
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
            padding: '20px',
          }}
          onClick={() => setSelectedIssue(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '680px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '14px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
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
              style={{
                padding: '18px 24px',
                borderBottom: '1px solid #e2e8f0',
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
                        ? '#fef2f2'
                        : '#fffbeb',
                    color: selectedIssue.severity === 'critical' ? '#dc2626' : '#b45309',
                    border: `1px solid ${selectedIssue.severity === 'critical' ? '#fecaca' : '#fde68a'}`,
                  }}
                >
                  {selectedIssue.severity}
                </span>
                <span style={{ fontSize: '13px', color: '#475569' }}>
                  Risk Score: <strong style={{ color: '#0f172a' }}>{selectedIssue.score}/100</strong>
                </span>
              </div>

              <button
                onClick={() => setSelectedIssue(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '4px',
                }}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <h3 id="issue-detail-title" style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a', lineHeight: 1.3 }}>
                  {selectedIssue.title}
                </h3>
                <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                  Repository:{' '}
                  <span style={{ color: '#0d9488', fontWeight: 700 }}>{selectedIssue.repository_name}</span>
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
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  fontSize: '12px',
                }}
              >
                <div>
                  <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600 }}>Scanner Engine</div>
                  <div style={{ color: '#0f172a', fontWeight: 700, marginTop: '2px' }}>{selectedIssue.scanner}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600 }}>Rule ID / CWE</div>
                  <div style={{ color: '#2563eb', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, marginTop: '2px' }}>
                    {selectedIssue.cwe_or_rule}
                  </div>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600 }}>File Location</div>
                  <div style={{ color: '#0f172a', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, marginTop: '2px' }}>
                    {selectedIssue.file_path || 'source_code'}
                    {selectedIssue.line_number ? `:${selectedIssue.line_number}` : ''}
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
                      ? '#f0fdf4'
                      : '#eff6ff',
                  border: `1px solid ${
                    selectedIssue.verification_status === 'false_positive' ? '#bbf7d0' : '#bfdbfe'
                  }`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>Current Verification Status</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', textTransform: 'capitalize' }}>
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
                        borderColor: '#059669',
                        color: '#059669',
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
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#f8fafc',
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
