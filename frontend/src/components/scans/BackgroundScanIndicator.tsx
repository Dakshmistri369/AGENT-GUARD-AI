import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ExternalLink,
  ChevronRight,
  X,
  Radio,
  Shield,
} from 'lucide-react';
import { api } from '../../lib/api';
import type { ActiveScanItem, ActiveScansResponse } from '../../types';

interface ScanToast {
  id: string;
  scanId: number;
  repoName: string;
  type: 'success' | 'error' | 'warning';
  title: string;
  message: string;
}

export const BackgroundScanIndicator: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [toasts, setToasts] = useState<ScanToast[]>([]);
  const [cancellingScanId, setCancellingScanId] = useState<number | null>(null);
  const [isCancellingAll, setIsCancellingAll] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Keep track of tracked active scans to detect terminal state transitions
  const previousActiveScansRef = useRef<Map<number, ActiveScanItem>>(new Map());

  // Bounded polling for active scans (every 6s when visible, 30s when backgrounded)
  const {
    data: activeData,
    isError,
  } = useQuery<ActiveScansResponse>({
    queryKey: ['activeScans'],
    queryFn: ({ signal }) => api.scans.getActive(signal),
    refetchInterval: () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return 30_000;
      }
      return 6_000;
    },
    refetchOnWindowFocus: true,
  });

  // Strictly count only active scans with status 'queued' or 'running'
  // Excludes any terminal or watchdog-timed-out scans
  const activeScans = (activeData?.scans ?? []).filter(
    (s) => s.status === 'queued' || s.status === 'running'
  );
  const activeCount = activeScans.length;

  // Detect when an active scan finishes or fails
  useEffect(() => {
    if (!activeData) return;

    const currentMap = new Map<number, ActiveScanItem>();
    for (const scan of activeScans) {
      currentMap.set(scan.id, scan);
    }

    // Check which previous scans are no longer in the active list
    for (const [prevId, prevScan] of previousActiveScansRef.current.entries()) {
      if (!currentMap.has(prevId)) {
        // Scan transitioned to terminal state -> fetch its final result for toast
        api.scans
          .get(prevId)
          .then((finalScan) => {
            // Auto-refresh dashboard queries when scan completes
            queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
            queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });

            const isSuccess = finalScan.status === 'completed';
            const findingsCount = finalScan.summary?.total_findings ?? 0;

            const newToast: ScanToast = {
              id: `${prevId}-${Date.now()}`,
              scanId: prevId,
              repoName: prevScan.repository_name,
              type: isSuccess ? 'success' : 'error',
              title: isSuccess ? 'Scan Completed' : 'Scan Ended',
              message: isSuccess
                ? `Audit of ${prevScan.repository_name} finished (${findingsCount} findings identified).`
                : `Scan of ${prevScan.repository_name} ${finalScan.status}: ${
                    finalScan.error_message || 'Unexpected worker interruption.'
                  }`,
            };

            setToasts((prev) => [...prev, newToast]);
          })
          .catch(() => {
            // Fallback generic completion notification
            queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
            setToasts((prev) => [
              ...prev,
              {
                id: `${prevId}-${Date.now()}`,
                scanId: prevId,
                repoName: prevScan.repository_name,
                type: 'info' as any,
                title: 'Scan Finished',
                message: `Background scan for ${prevScan.repository_name} has concluded.`,
              },
            ]);
          });
      }
    }

    previousActiveScansRef.current = currentMap;
  }, [activeData, activeScans, queryClient]);

  // Close dropdown on outside click or escape
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('pointerdown', handlePointerDown);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Auto-dismiss toasts after 8 seconds
  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const formatStage = (stage?: string | null) => {
    if (!stage) return 'In Progress';
    switch (stage) {
      case 'validating':
        return 'Stage 1/6: Validating';
      case 'fetching_metadata':
        return 'Stage 2/6: Metadata';
      case 'inspecting_file_tree':
        return 'Stage 3/6: File Tree';
      case 'running_scanners':
        return 'Stage 4/6: Running Scanners';
      case 'reviewing_evidence':
        return 'Stage 5/6: Evidence';
      case 'generating_report':
        return 'Stage 6/6: Generating Report';
      default:
        return stage.replace(/_/g, ' ');
    }
  };

  const formatElapsed = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleCancelSingle = async (scanId: number) => {
    setCancellingScanId(scanId);
    try {
      await api.scans.cancel(scanId);
      await queryClient.invalidateQueries({ queryKey: ['activeScans'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      await queryClient.invalidateQueries({ queryKey: ['repositories'] });
    } catch (err) {
      console.error('Failed to cancel scan', err);
    } finally {
      setCancellingScanId(null);
    }
  };

  const handleCancelAll = async () => {
    setIsCancellingAll(true);
    try {
      await api.scans.cancelAll();
      await queryClient.invalidateQueries({ queryKey: ['activeScans'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      await queryClient.invalidateQueries({ queryKey: ['repositories'] });
    } catch (err) {
      console.error('Failed to cancel all active scans', err);
    } finally {
      setIsCancellingAll(false);
    }
  };

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      {/* Activity Button in Top Navigation */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={
          isError
            ? 'Background scan status unavailable'
            : activeCount > 0
            ? `${activeCount} background scan${activeCount > 1 ? 's' : ''} in progress`
            : 'No background scans running'
        }
        title={
          isError
            ? 'Background scan status unavailable'
            : activeCount > 0
            ? `${activeCount} scan(s) active — click for live pipeline details`
            : 'No background scans running — click to view'
        }
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 10px',
          borderRadius: '8px',
          border: isError
            ? '1px solid #fed7aa'
            : activeCount > 0
            ? '1px solid #a7f3d0'
            : '1px solid #e2e8f0',
          background: isError
            ? '#fff7ed'
            : activeCount > 0
            ? '#f0fdf4'
            : '#ffffff',
          color: isError
            ? '#c2410c'
            : activeCount > 0
            ? '#047857'
            : '#64748b',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          minHeight: '34px',
          transition: 'all 0.15s ease',
        }}
        className="hover:border-slate-300"
      >
        {activeCount > 0 ? (
          <>
            <span
              style={{
                position: 'relative',
                display: 'flex',
                height: '8px',
                width: '8px',
              }}
            >
              <span
                className="animate-ping"
                style={{
                  position: 'absolute',
                  display: 'inline-flex',
                  height: '100%',
                  width: '100%',
                  borderRadius: '9999px',
                  background: '#10b981',
                  opacity: 0.75,
                }}
              />
              <span
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  borderRadius: '9999px',
                  height: '8px',
                  width: '8px',
                  background: '#059669',
                }}
              />
            </span>
            <RefreshCw size={13} className="animate-spin text-emerald-600" />
            <span className="hidden sm:inline">Active Scans</span>
            <span
              style={{
                fontSize: '10.5px',
                fontWeight: 700,
                background: '#059669',
                color: '#ffffff',
                padding: '1px 6px',
                borderRadius: '9999px',
              }}
            >
              {activeCount}
            </span>
          </>
        ) : isError ? (
          <>
            <AlertTriangle size={13} color="#ea580c" />
            <span className="hidden sm:inline">Scans Offline</span>
          </>
        ) : (
          <>
            <Radio size={14} color="#64748b" />
            <span className="hidden sm:inline">Scans</span>
            <span
              style={{
                fontSize: '10px',
                color: '#94a3b8',
                background: '#f1f5f9',
                padding: '1px 5px',
                borderRadius: '4px',
                fontWeight: 600,
              }}
            >
              0
            </span>
          </>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Active Background Scans List"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '340px',
            maxWidth: '90vw',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            zIndex: 100,
            overflow: 'hidden',
          }}
          className="animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 14px',
              borderBottom: '1px solid #f1f5f9',
              background: '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={15} color={activeCount > 0 ? '#059669' : '#64748b'} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                Background Scan Activity
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {activeCount > 0 && (
                <button
                  onClick={handleCancelAll}
                  disabled={isCancellingAll}
                  style={{
                    border: '1px solid #fecaca',
                    background: '#fef2f2',
                    color: '#dc2626',
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    cursor: isCancellingAll ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease',
                  }}
                  title="Cancel all running and queued background scans"
                >
                  {isCancellingAll ? (
                    <RefreshCw size={10} className="animate-spin text-red-600" />
                  ) : (
                    <XCircle size={11} color="#dc2626" />
                  )}
                  <span>{isCancellingAll ? 'Cancelling...' : 'Cancel All'}</span>
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Close active scans list"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div style={{ maxHeight: '320px', overflowY: 'auto', padding: '8px' }}>
            {isError ? (
              <div
                style={{
                  padding: '24px 16px',
                  textAlign: 'center',
                  color: '#64748b',
                  fontSize: '12.5px',
                }}
              >
                <AlertTriangle size={24} color="#ea580c" style={{ margin: '0 auto 8px auto' }} />
                <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>
                  Status Unavailable
                </div>
                <div>Unable to connect to scan background coordinator. Check network status.</div>
              </div>
            ) : activeCount === 0 ? (
              <div
                style={{
                  padding: '24px 16px',
                  textAlign: 'center',
                  color: '#64748b',
                  fontSize: '12.5px',
                }}
              >
                <CheckCircle2 size={24} color="#059669" style={{ margin: '0 auto 8px auto' }} />
                <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>
                  No Active Scans
                </div>
                <div>All background audits are complete. New scans will appear here in real time.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {activeScans.map((scan) => (
                  <div
                    key={scan.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '12.5px',
                          fontWeight: 700,
                          color: '#0f172a',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '200px',
                        }}
                        title={scan.repository_full_name}
                      >
                        {scan.repository_name}
                      </span>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          color: '#475569',
                          fontWeight: 600,
                        }}
                      >
                        <Clock size={11} />
                        {formatElapsed(scan.elapsed_seconds)}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '11px',
                      }}
                    >
                      <span
                        style={{
                          color: '#047857',
                          background: '#ecfdf5',
                          border: '1px solid #a7f3d0',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <RefreshCw size={9} className="animate-spin" />
                        {formatStage(scan.stage)}
                      </span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          onClick={() => handleCancelSingle(scan.id)}
                          disabled={cancellingScanId === scan.id}
                          style={{
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                            color: '#dc2626',
                            cursor: cancellingScanId === scan.id ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                            fontWeight: 600,
                            fontSize: '11px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            transition: 'all 0.15s ease',
                          }}
                          title="Cancel this ongoing scan"
                        >
                          {cancellingScanId === scan.id ? (
                            <RefreshCw size={9} className="animate-spin text-red-600" />
                          ) : (
                            <XCircle size={10} color="#dc2626" />
                          )}
                          <span>{cancellingScanId === scan.id ? '...' : 'Cancel'}</span>
                        </button>

                        <button
                          onClick={() => {
                            setIsOpen(false);
                            if (scan.repository_id) {
                              navigate(`/repositories?repoId=${scan.repository_id}&tab=history`);
                            } else {
                              navigate('/repositories?tab=history');
                            }
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#2563eb',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                            fontWeight: 600,
                            fontSize: '11px',
                          }}
                        >
                          <span>View</span>
                          <ChevronRight size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '10px 14px',
              borderTop: '1px solid #f1f5f9',
              background: '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11.5px',
            }}
          >
            <span style={{ color: '#64748b' }}>
              Worker engine: <strong style={{ color: '#0f172a' }}>arq + Redis</strong>
            </span>
            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/repositories?tab=history');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#2563eb',
                cursor: 'pointer',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
              }}
            >
              <span>Scan History</span>
              <ExternalLink size={11} />
            </button>
          </div>
        </div>
      )}

      {/* Floating Notifications (Toasts) when scans complete or fail */}
      {toasts.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxWidth: '360px',
            width: 'calc(100vw - 40px)',
          }}
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              style={{
                background: '#ffffff',
                border:
                  toast.type === 'success'
                    ? '1px solid #86efac'
                    : toast.type === 'error'
                    ? '1px solid #fca5a5'
                    : '1px solid #cbd5e1',
                borderRadius: '10px',
                padding: '12px 14px',
                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
              }}
              className="animate-in slide-in-from-bottom-2 fade-in duration-200"
            >
              {toast.type === 'success' ? (
                <CheckCircle2 size={18} color="#059669" style={{ flexShrink: 0, marginTop: '2px' }} />
              ) : toast.type === 'error' ? (
                <XCircle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
              ) : (
                <Shield size={18} color="#2563eb" style={{ flexShrink: 0, marginTop: '2px' }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                  {toast.title}
                </div>
                <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px', lineHeight: 1.4 }}>
                  {toast.message}
                </div>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                aria-label="Dismiss scan notification"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '2px',
                }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
