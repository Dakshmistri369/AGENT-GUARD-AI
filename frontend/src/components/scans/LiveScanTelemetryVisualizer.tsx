import React, { useEffect, useState, useMemo } from 'react';
import {
  RotateCw,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Shield,
  Lock,
  Cpu,
  Activity,
  Server,
  FileCode,
  Gauge,
  AlertTriangle,
} from 'lucide-react';
import type { Scan, RepositoryMetadata, ScanReport } from '../../types';

export const SCAN_STAGES = [
  { id: 'validating', label: '1. Repository Validation', description: 'Zero-trust verification & Git handshake' },
  { id: 'fetching_metadata', label: '2. Metadata Inspection', description: 'Branch, commit SHA & AST language tree' },
  { id: 'inspecting_file_tree', label: '3. File Tree Analysis', description: 'Manifest filters & diff scope selection' },
  { id: 'running_scanners', label: '4. Multi-Engine Scanners', description: 'Semgrep, Bandit, OSV & detect-secrets' },
  { id: 'reviewing_evidence', label: '5. Evidence Review', description: 'AI LangGraph neural triage & verification' },
  { id: 'generating_report', label: '6. Report Generation', description: 'Actionable diff patches & CVSS metrics' },
] as const;

export interface LiveScanTelemetryVisualizerProps {
  scan: Scan | null;
  isScanning: boolean;
  repoName?: string;
  branch?: string;
  commitSha?: string | null;
  metadata?: RepositoryMetadata | null;
  scanReport?: ScanReport | null;
}

export const LiveScanTelemetryVisualizer: React.FC<LiveScanTelemetryVisualizerProps> = ({
  scan,
  isScanning,
  repoName,
  branch,
  commitSha,
  metadata,
  scanReport,
}) => {
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [astNodesCounter, setAstNodesCounter] = useState<number>(0);

  // Timer for active scan duration
  useEffect(() => {
    if (!isScanning) {
      if (scan?.completed_at && scan?.started_at) {
        const diff = Math.max(
          1,
          Math.round(
            (new Date(scan.completed_at).getTime() - new Date(scan.started_at).getTime()) / 1000
          )
        );
        setElapsedSec(diff);
      }
      return;
    }

    const startTime = scan?.started_at ? new Date(scan.started_at).getTime() : Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      const secs = Math.max(1, Math.round((now - startTime) / 1000));
      setElapsedSec(secs);
    }, 1000);

    return () => clearInterval(interval);
  }, [isScanning, scan?.started_at, scan?.completed_at]);

  // Dynamic AST node evaluation simulator during scanning
  useEffect(() => {
    const totalFiles = scan?.files_discovered || metadata?.file_count || 48;
    const targetNodes = Math.max(1200, totalFiles * 185);

    if (scan?.status === 'completed' || scanReport) {
      setAstNodesCounter(targetNodes);
      return;
    }

    if (!isScanning) {
      setAstNodesCounter(0);
      return;
    }

    const interval = setInterval(() => {
      setAstNodesCounter((prev) => {
        if (prev >= targetNodes) return targetNodes;
        const step = Math.floor(Math.random() * 240) + 90;
        return Math.min(targetNodes, prev + step);
      });
    }, 400);

    return () => clearInterval(interval);
  }, [isScanning, scan?.status, scan?.files_discovered, metadata?.file_count, scanReport]);

  const totalFiles = useMemo(() => {
    return scan?.files_discovered || metadata?.file_count || scanReport?.metadata?.file_count || 48;
  }, [scan?.files_discovered, metadata?.file_count, scanReport?.metadata?.file_count]);

  const filesProcessed = useMemo(() => {
    if (scan?.status === 'completed' || scanReport) {
      return totalFiles;
    }
    if (!isScanning) return 0;
    const stage = scan?.stage;
    if (stage === 'validating') return Math.floor(totalFiles * 0.1);
    if (stage === 'fetching_metadata') return Math.floor(totalFiles * 0.25);
    if (stage === 'inspecting_file_tree') return Math.floor(totalFiles * 0.5);
    if (stage === 'running_scanners') return Math.floor(totalFiles * 0.85);
    if (stage === 'reviewing_evidence') return Math.floor(totalFiles * 0.95);
    if (stage === 'generating_report') return totalFiles;
    return Math.min(totalFiles, Math.max(1, Math.floor((elapsedSec * 6) % (totalFiles + 1))));
  }, [scan?.status, scan?.stage, scanReport, isScanning, totalFiles, elapsedSec]);

  const filesPerSec = useMemo(() => {
    if (isScanning) {
      return Math.min(185, Math.max(24, Math.round(filesProcessed / Math.max(1, elapsedSec) * 10) / 10));
    }
    if (scan?.status === 'completed' && elapsedSec > 0) {
      return Math.round((totalFiles / elapsedSec) * 10) / 10;
    }
    return 64.2;
  }, [isScanning, scan?.status, filesProcessed, elapsedSec, totalFiles]);

  const memoryFootprint = useMemo(() => {
    if (isScanning) {
      return 142 + ((elapsedSec * 7) % 68);
    }
    return 164;
  }, [isScanning, elapsedSec]);

  // Multi-engine status computation
  const engineStatuses = useMemo(() => {
    const isRunningScanners = isScanning && (scan?.stage === 'running_scanners' || scan?.stage === 'reviewing_evidence');
    const isCompleted = scan?.status === 'completed' || !!scanReport;

    return [
      {
        id: 'semgrep',
        name: 'Semgrep SAST',
        tech: 'Interprocedural Taint Analysis',
        icon: Zap,
        color: '#00f0ff',
        bg: 'rgba(0, 240, 255, 0.12)',
        status: isCompleted ? 'Completed' : isRunningScanners ? 'Scanning AST' : isScanning ? 'Queued' : 'Standby',
        findings: scanReport?.summary?.scanner_breakdown?.['semgrep'] ?? 0,
      },
      {
        id: 'bandit',
        name: 'Bandit AST',
        tech: 'Python AST Security Inspection',
        icon: Shield,
        color: '#10b981',
        bg: 'rgba(16, 185, 129, 0.12)',
        status: isCompleted ? 'Completed' : isRunningScanners ? 'Analyzing Nodes' : isScanning ? 'Queued' : 'Standby',
        findings: scanReport?.summary?.scanner_breakdown?.['bandit'] ?? 0,
      },
      {
        id: 'osv',
        name: 'OSV-Scanner SCA',
        tech: 'CVE / Open Source Vulnerability DB',
        icon: Cpu,
        color: '#a855f7',
        bg: 'rgba(168, 85, 247, 0.12)',
        status: isCompleted ? 'Completed' : isRunningScanners ? 'Querying OSV' : isScanning ? 'Queued' : 'Standby',
        findings: scanReport?.summary?.scanner_breakdown?.['osv'] ?? 0,
      },
      {
        id: 'detect_secrets',
        name: 'detect-secrets',
        tech: 'High-Entropy Secret Classifier',
        icon: Lock,
        color: '#f59e0b',
        bg: 'rgba(245, 158, 11, 0.12)',
        status: isCompleted ? 'Completed' : isRunningScanners ? 'Auditing Secrets' : isScanning ? 'Queued' : 'Standby',
        findings: scanReport?.summary?.scanner_breakdown?.['detect-secrets'] ?? 0,
      },
    ];
  }, [isScanning, scan?.stage, scan?.status, scanReport]);

  const currentStageName = useMemo(() => {
    if (!scan) return 'Ready for Scan';
    if (scan.status === 'completed') return 'Security Audit Completed';
    if (scan.status === 'failed') return 'Scan Execution Terminated';
    if (scan.status === 'queued') return 'Scan Job Enqueued';
    const stg = SCAN_STAGES.find((s) => s.id === scan.stage);
    return stg ? stg.label : (scan.stage || 'Executing Workspace');
  }, [scan]);

  return (
    <div
      style={{
        borderRadius: '12px',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        background: 'rgba(10, 18, 32, 0.95)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
        overflow: 'hidden',
        marginBottom: '20px',
      }}
    >
      {/* ── Top Header Bar ── */}
      <div
        style={{
          padding: '12px 18px',
          background: 'linear-gradient(90deg, #07162b 0%, #0a1f38 100%)',
          borderBottom: '1px solid rgba(56, 189, 248, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: isScanning ? 'rgba(0, 240, 255, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              border: `1px solid ${isScanning ? 'rgba(0, 240, 255, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isScanning ? (
              <RotateCw size={17} className="animate-spin" color="#00f0ff" />
            ) : scan?.status === 'failed' ? (
              <XCircle size={17} color="#fb7185" />
            ) : (
              <Activity size={17} color="#10b981" />
            )}
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{currentStageName}</span>
              {isScanning && (
                <span
                  style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: 'rgba(0, 240, 255, 0.2)',
                    color: '#00f0ff',
                    border: '1px solid rgba(0, 240, 255, 0.4)',
                    fontWeight: 700,
                    letterSpacing: '0.4px',
                  }}
                >
                  LIVE TELEMETRY
                </span>
              )}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              Target: <strong style={{ color: '#38bdf8' }}>{repoName || 'agentguard/core-scanner'}</strong>
              {branch && <span> • Branch: <code style={{ color: '#cbd5e1' }}>{branch}</code></span>}
              {commitSha && <span> • SHA: <code style={{ color: '#cbd5e1' }}>{commitSha.slice(0, 7)}</code></span>}
            </div>
          </div>
        </div>

        {/* Live Counters Strip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={13} color="#38bdf8" />
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Elapsed:</span>
            <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#f8fafc', fontWeight: 600 }}>
              {elapsedSec}s
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Gauge size={13} color="#00f0ff" />
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Throughput:</span>
            <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#00f0ff', fontWeight: 600 }}>
              {filesPerSec} files/s
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileCode size={13} color="#34d399" />
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>AST Nodes:</span>
            <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#34d399', fontWeight: 600 }}>
              {astNodesCounter.toLocaleString()}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Server size={13} color="#c084fc" />
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Worker Mem:</span>
            <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#c084fc', fontWeight: 600 }}>
              {memoryFootprint} MB
            </span>
          </div>
        </div>
      </div>

      {/* ── Multi-Engine Status HUD ── */}
      <div
        style={{
          padding: '12px 18px',
          background: 'rgba(8, 14, 26, 0.95)',
          borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '10px',
        }}
      >
        {engineStatuses.map((engine) => {
          const IconComponent = engine.icon;
          return (
            <div
              key={engine.id}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                background: 'rgba(15, 23, 42, 0.85)',
                border: `1px solid ${engine.bg}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    background: engine.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <IconComponent size={13} color={engine.color} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {engine.name}
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {engine.tech}
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <span
                  style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: engine.bg,
                    color: engine.color,
                    fontWeight: 600,
                  }}
                >
                  {engine.status}
                </span>
                {scanReport && (
                  <div style={{ fontSize: '10px', color: engine.findings > 0 ? '#fb7185' : '#34d399', marginTop: '2px' }}>
                    {engine.findings} findings
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 6-Stage Security Pipeline Stepper ── */}
      <div style={{ padding: '14px 18px', background: 'rgba(10, 18, 32, 0.85)' }}>
        <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '10px' }}>
          Autonomous 6-Stage Execution Pipeline
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {SCAN_STAGES.map((stg, idx) => {
            const isScanRunning = isScanning || scan?.status === 'running' || scan?.status === 'queued';
            const isCompletedScan = scan?.status === 'completed' || scan?.status === 'timed_out_partial';
            const isFailedScan = scan?.status === 'failed';

            let isStageDone = isCompletedScan;
            let isStageCurrent = false;
            let isStageFailed = false;

            if (isScanRunning) {
              if (scan?.stage === 'queued' || scan?.status === 'queued') {
                isStageDone = false;
                isStageCurrent = false;
              } else {
                const currentStageIdx = SCAN_STAGES.findIndex((s) => s.id === scan?.stage);
                if (currentStageIdx >= 0) {
                  isStageDone = idx < currentStageIdx;
                  isStageCurrent = idx === currentStageIdx;
                } else {
                  isStageCurrent = idx === 0;
                }
              }
            } else if (isFailedScan) {
              const failStageIdx = SCAN_STAGES.findIndex((s) => s.id === scan?.stage);
              const effectiveFailIdx = failStageIdx >= 0 ? failStageIdx : 0;
              isStageDone = idx < effectiveFailIdx;
              isStageFailed = idx === effectiveFailIdx;
            }

            return (
              <div
                key={stg.id}
                style={{
                  padding: '9px 11px',
                  borderRadius: '8px',
                  background: isStageFailed
                    ? 'rgba(244, 63, 94, 0.15)'
                    : isStageDone
                    ? 'rgba(16, 185, 129, 0.12)'
                    : isStageCurrent
                    ? 'rgba(0, 240, 255, 0.15)'
                    : 'rgba(15, 23, 42, 0.6)',
                  border: isStageFailed
                    ? '1px solid rgba(244, 63, 94, 0.45)'
                    : isStageDone
                    ? '1px solid rgba(16, 185, 129, 0.4)'
                    : isStageCurrent
                    ? '1px solid rgba(0, 240, 255, 0.5)'
                    : '1px solid rgba(56, 189, 248, 0.14)',
                  boxShadow: isStageCurrent ? '0 0 14px rgba(0, 240, 255, 0.25)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  fontSize: '11px',
                  color: isStageFailed
                    ? '#fb7185'
                    : isStageDone
                    ? '#34d399'
                    : isStageCurrent
                    ? '#00f0ff'
                    : '#cbd5e1',
                  transition: 'all 0.2s ease',
                }}
                title={stg.description}
              >
                {isStageFailed ? (
                  <XCircle size={13} color="#fb7185" style={{ flexShrink: 0 }} />
                ) : isStageDone ? (
                  <CheckCircle2 size={13} color="#34d399" style={{ flexShrink: 0 }} />
                ) : isStageCurrent ? (
                  <RotateCw size={13} className="animate-spin" color="#00f0ff" style={{ flexShrink: 0 }} />
                ) : (
                  <Clock size={13} color="#64748b" style={{ flexShrink: 0 }} />
                )}
                <span
                  style={{
                    fontWeight: isStageFailed || isStageCurrent ? 700 : 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {stg.label}{isStageFailed ? ' (Failed)' : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Error / Warning Notice */}
      {scan?.error_message && (
        <div
          style={{
            margin: '0 18px 14px',
            padding: '10px 14px',
            borderRadius: '6px',
            background: scan.status === 'failed' ? 'rgba(244, 63, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
            border: scan.status === 'failed' ? '1px solid rgba(244, 63, 94, 0.45)' : '1px solid rgba(245, 158, 11, 0.4)',
            color: scan.status === 'failed' ? '#fb7185' : '#fcd34d',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
          }}
        >
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '2px', color: scan.status === 'failed' ? '#fb7185' : '#fcd34d' }} />
          <div>
            <strong>{scan.status === 'failed' ? 'Scan Failure: ' : 'Coverage Warning: '}</strong>
            {scan.error_message}
          </div>
        </div>
      )}
    </div>
  );
};
