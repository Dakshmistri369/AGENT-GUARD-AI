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
      // Invalidate and refetch dashboard summary so False Positives & Potential Issues counters update instantly
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
    <div style={{ padding: '28px 32px', maxWidth: '1440px', margin: '0 auto' }}>
      {/* ── Page Header matching screenshot ─────────────────────────────────────── */}
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
              color: '#f8fafc',
              letterSpacing: '-0.4px',
              lineHeight: 1.2,
            }}
          >
            Dashboard
          </h1>
          <p style={{ fontSize: '12.5px', color: '#64748b', marginTop: '4px' }}>
            Multi-engine AST security, dependency supply chain, and secret exposure monitor
          </p>
        </div>

        {/* Action Buttons matching screenshot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '8px 12px' }}
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
              background: 'rgba(15, 32, 64, 0.7)',
              borderColor: 'rgba(59, 130, 246, 0.4)',
              color: '#f1f5f9',
            }}
          >
            <Play size={13} fill="#60a5fa" color="#60a5fa" />
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
              boxShadow: '0 0 16px rgba(37, 99, 235, 0.4)',
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
            background: 'rgba(244, 63, 94, 0.12)',
            border: '1px solid rgba(244, 63, 94, 0.35)',
            color: '#f43f5e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <XCircle size={18} />
            <span style={{ fontSize: '13px' }}>
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

      {/* ── Top Row: Four Summary Cards matching screenshot ─────────────────────── */}
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
          accentColor="#3b82f6"
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
          accentColor="#2dd4bf"
          badge={summary && summary.false_positives.percentage > 0 ? `${summary.false_positives.percentage}%` : undefined}
          badgeColor="#2dd4bf"
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
          accentColor="#f59e0b"
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
          accentColor="#8b5cf6"
          badge={summary && summary.patches_generated.percentage > 0 ? `${summary.patches_generated.percentage}%` : undefined}
          badgeColor="#8b5cf6"
          onClick={() => navigate('/repositories?tab=solutions')}
          isLoading={isLoading}
        />
      </div>

      {/* ── Middle Row: 3 Chart Panels matching screenshot ──────────────────────── */}
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
              <div className="animate-spin" style={{ width: '28px', height: '28px', border: '3px solid rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', borderRadius: '50%' }} />
            </div>
          ) : !summary || summary.vulnerability_types.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px', color: '#64748b' }}>
              <CheckCircle2 size={32} color="#10b981" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>No Issues Found</div>
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
                                background: '#0a1628',
                                border: '1px solid rgba(45, 212, 191, 0.4)',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                              }}
                            >
                              <div style={{ fontWeight: 600, color: '#f8fafc' }}>{data.name}</div>
                              <div style={{ color: '#2dd4bf', marginTop: '2px' }}>
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

              {/* Legend matching screenshot (Acronym + Percentage) */}
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
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#f8fafc', lineHeight: 1.1 }}>
                        {vt.short_name}
                      </div>
                      <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '1px' }}>
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
              <div className="animate-spin" style={{ width: '28px', height: '28px', border: '3px solid rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', borderRadius: '50%' }} />
            </div>
          ) : !summary || summary.severity_distribution.total === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px', color: '#64748b' }}>
              <CheckCircle2 size={32} color="#10b981" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>Zero Vulnerabilities</div>
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
                  background: 'rgba(15, 32, 64, 0.4)',
                  border: '1px solid rgba(30, 58, 110, 0.6)',
                  marginBottom: '24px',
                }}
              >
                {summary.severity_distribution.critical > 0 && (
                  <div
                    style={{
                      width: `${(summary.severity_distribution.critical / summary.severity_distribution.total) * 100}%`,
                      background: '#f43f5e',
                      transition: 'width 0.4s ease',
                    }}
                    title={`Critical: ${summary.severity_distribution.critical}`}
                  />
                )}
                {summary.severity_distribution.high > 0 && (
                  <div
                    style={{
                      width: `${(summary.severity_distribution.high / summary.severity_distribution.total) * 100}%`,
                      background: '#f59e0b',
                      transition: 'width 0.4s ease',
                    }}
                    title={`High: ${summary.severity_distribution.high}`}
                  />
                )}
                {summary.severity_distribution.medium > 0 && (
                  <div
                    style={{
                      width: `${(summary.severity_distribution.medium / summary.severity_distribution.total) * 100}%`,
                      background: '#3b82f6',
                      transition: 'width 0.4s ease',
                    }}
                    title={`Medium: ${summary.severity_distribution.medium}`}
                  />
                )}
                {summary.severity_distribution.low > 0 && (
                  <div
                    style={{
                      width: `${(summary.severity_distribution.low / summary.severity_distribution.total) * 100}%`,
                      background: '#10b981',
                      transition: 'width 0.4s ease',
                    }}
                    title={`Low: ${summary.severity_distribution.low}`}
                  />
                )}
                {summary.severity_distribution.info > 0 && (
                  <div
                    style={{
                      width: `${(summary.severity_distribution.info / summary.severity_distribution.total) * 100}%`,
                      background: '#64748b',
                      transition: 'width 0.4s ease',
                    }}
                    title={`Info: ${summary.severity_distribution.info}`}
                  />
                )}
              </div>

              {/* Severity Legend & Counts underneath (matching screenshot) */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '14px', borderRadius: '2px', background: '#f43f5e' }} />
                  <div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Critical</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>{summary.severity_distribution.critical}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '14px', borderRadius: '2px', background: '#f59e0b' }} />
                  <div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>High</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>{summary.severity_distribution.high}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '14px', borderRadius: '2px', background: '#3b82f6' }} />
                  <div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Medium</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>{summary.severity_distribution.medium}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '14px', borderRadius: '2px', background: '#10b981' }} />
                  <div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Low</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>{summary.severity_distribution.low}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '14px', borderRadius: '2px', background: '#64748b' }} />
                  <div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Info</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>{summary.severity_distribution.info}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </ChartPanel>

        {/* Card 3: Issues By PR Author / Scanner Health & Coverage */}
        <ChartPanel
          title="Scanner Health & Coverage"
          infoTooltip="Live operational status of configured static scanners, package analyzers, and secret detectors."
        >
          <ScannerStatus scanners={summary?.scanner_health ?? []} isLoading={isLoading} />
        </ChartPanel>
      </div>

      {/* ── Bottom Row: 3 Widget Panels matching screenshot ─────────────────────── */}
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
              <div className="animate-spin" style={{ width: '28px', height: '28px', border: '3px solid rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', borderRadius: '50%' }} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '240px', justifyContent: 'space-between', padding: '12px 8px' }}>
              {/* Primary Time Saved Metric */}
              <div style={{ textAlign: 'center', marginTop: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>
                  <Clock size={16} color="#60a5fa" />
                  <span>Total Time Saved</span>
                </div>
                <div
                  style={{
                    fontSize: '44px',
                    fontWeight: 800,
                    color: '#f8fafc',
                    letterSpacing: '-1px',
                    lineHeight: 1.1,
                  }}
                >
                  {summary?.metrics.total_time_saved_hours ?? 0}
                  <span style={{ fontSize: '24px', fontWeight: 500, color: '#94a3b8', marginLeft: '4px' }}>h</span>
                </div>
              </div>

              {/* Split breakdown: Logic vs Traditional/Automated */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-around',
                  paddingTop: '16px',
                  borderTop: '1px solid rgba(30, 58, 110, 0.45)',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: '#64748b', fontSize: '11px', marginBottom: '2px' }}>
                    <Code2 size={13} color="#2dd4bf" />
                    <span>Logic</span>
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#f1f5f9' }}>
                    {summary?.metrics.logic_hours ?? 0}h
                  </div>
                </div>

                <div style={{ width: '1px', height: '32px', background: 'rgba(30, 58, 110, 0.45)' }} />

                <div style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: '#64748b', fontSize: '11px', marginBottom: '2px' }}>
                    <Cpu size={13} color="#a855f7" />
                    <span>Traditional</span>
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#f1f5f9' }}>
                    {summary?.metrics.traditional_hours ?? 0}h
                  </div>
                </div>
              </div>
            </div>
          )}
        </ChartPanel>

        {/* Card 2: Most Critical Issues (with Interactive Row) */}
        <ChartPanel
          title="Most Critical Issues"
          infoTooltip="Highest severity security findings requiring immediate attention or automated patch review."
          action={
            <button
              onClick={() => navigate('/repositories?tab=findings')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#60a5fa',
                fontSize: '11.5px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              View all
            </button>
          }
        >
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 0' }}>
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse" style={{ height: '52px', borderRadius: '8px', background: 'rgba(30, 58, 110, 0.25)' }} />
              ))}
            </div>
          ) : !summary || summary.most_critical_issues.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px', color: '#64748b' }}>
              <CheckCircle2 size={32} color="#10b981" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>No Critical Issues</div>
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
                color: '#60a5fa',
                fontSize: '11.5px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Manage repos
            </button>
          }
        >
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 0' }}>
              {[1, 2].map((i) => (
                <div key={i} className="animate-pulse" style={{ height: '56px', borderRadius: '8px', background: 'rgba(30, 58, 110, 0.25)' }} />
              ))}
            </div>
          ) : !summary || summary.issues_by_repository.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px', color: '#64748b' }}>
              <GitBranch size={32} color="#60a5fa" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>No Repositories Connected</div>
              <div style={{ fontSize: '12px', marginBottom: '12px' }}>Connect a repository to audit findings.</div>
              <button onClick={handleNewRepo} className="btn btn-primary" style={{ fontSize: '11px' }}>
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
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'rgba(15, 23, 42, 0.5)',
                    border: '1px solid rgba(30, 58, 110, 0.3)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#3b82f6')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(30, 58, 110, 0.3)')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <GitBranch size={13} color="#2dd4bf" />
                      <span>{repo.repository_name}</span>
                    </div>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'JetBrains Mono, monospace' }}>
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
                      background: 'rgba(30, 58, 110, 0.4)',
                    }}
                  >
                    {repo.total === 0 ? (
                      <div style={{ width: '100%', background: '#10b981' }} title="Clean" />
                    ) : (
                      <>
                        {repo.critical > 0 && (
                          <div style={{ width: `${(repo.critical / repo.total) * 100}%`, background: '#f43f5e' }} />
                        )}
                        {repo.high > 0 && (
                          <div style={{ width: `${(repo.high / repo.total) * 100}%`, background: '#f59e0b' }} />
                        )}
                        {repo.medium > 0 && (
                          <div style={{ width: `${(repo.medium / repo.total) * 100}%`, background: '#3b82f6' }} />
                        )}
                        {repo.low > 0 && (
                          <div style={{ width: `${(repo.low / repo.total) * 100}%`, background: '#10b981' }} />
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
            background: 'rgba(3, 8, 19, 0.8)',
            backdropFilter: 'blur(6px)',
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
              background: '#091528',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              borderRadius: '14px',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
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
                borderBottom: '1px solid rgba(30, 58, 110, 0.5)',
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
                        ? 'rgba(244, 63, 94, 0.2)'
                        : 'rgba(245, 158, 11, 0.2)',
                    color: selectedIssue.severity === 'critical' ? '#f43f5e' : '#fbbf24',
                    border: `1px solid ${selectedIssue.severity === 'critical' ? '#f43f5e' : '#fbbf24'}40`,
                  }}
                >
                  {selectedIssue.severity}
                </span>
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>
                  Risk Score: <strong style={{ color: '#f8fafc' }}>{selectedIssue.score}/100</strong>
                </span>
              </div>

              <button
                onClick={() => setSelectedIssue(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
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
                <h3 id="issue-detail-title" style={{ fontSize: '17px', fontWeight: 700, color: '#f8fafc', lineHeight: 1.3 }}>
                  {selectedIssue.title}
                </h3>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  Repository:{' '}
                  <span style={{ color: '#2dd4bf', fontWeight: 600 }}>{selectedIssue.repository_name}</span>
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
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(30, 58, 110, 0.35)',
                  fontSize: '12px',
                }}
              >
                <div>
                  <div style={{ color: '#64748b', fontSize: '11px' }}>Scanner Engine</div>
                  <div style={{ color: '#f1f5f9', fontWeight: 600, marginTop: '2px' }}>{selectedIssue.scanner}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: '11px' }}>Rule ID / CWE</div>
                  <div style={{ color: '#60a5fa', fontFamily: 'JetBrains Mono, monospace', marginTop: '2px' }}>
                    {selectedIssue.cwe_or_rule}
                  </div>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ color: '#64748b', fontSize: '11px' }}>File Location</div>
                  <div style={{ color: '#e2e8f0', fontFamily: 'JetBrains Mono, monospace', marginTop: '2px' }}>
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
                      ? 'rgba(45, 212, 191, 0.1)'
                      : 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(30, 58, 110, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Current Verification Status</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', textTransform: 'capitalize' }}>
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
                        borderColor: 'rgba(45, 212, 191, 0.4)',
                        color: '#2dd4bf',
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
                borderTop: '1px solid rgba(30, 58, 110, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(7, 14, 27, 0.6)',
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
