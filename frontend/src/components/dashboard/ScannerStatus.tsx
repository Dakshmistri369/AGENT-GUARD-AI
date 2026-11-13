import React from 'react';
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import type { ScannerHealthItem } from '../../types';

export interface ScannerStatusProps {
  scanners: ScannerHealthItem[];
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
}

export const ScannerStatus: React.FC<ScannerStatusProps> = ({
  scanners,
  isLoading = false,
  isError = false,
  errorMessage,
  onRetry,
}) => {
  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 0' }}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="animate-pulse"
            style={{
              height: '48px',
              borderRadius: '8px',
              background: 'rgba(56, 189, 248, 0.08)',
            }}
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '240px',
          color: '#64748b',
          textAlign: 'center',
          padding: '0 16px',
        }}
      >
        <AlertCircle size={32} color="#f43f5e" style={{ marginBottom: '8px' }} />
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
          Scanner Health Unavailable
        </div>
        <div style={{ fontSize: '12px', color: '#cbd5e1', maxWidth: '280px', marginTop: '4px' }}>
          {errorMessage || 'Unable to connect to scanner coordinator.'}
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="btn btn-secondary"
            style={{ marginTop: '12px', fontSize: '11.5px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <RefreshCw size={12} />
            <span>Retry</span>
          </button>
        )}
      </div>
    );
  }

  if (scanners.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '240px',
          color: '#cbd5e1',
          textAlign: 'center',
        }}
      >
        <CheckCircle2 size={32} color="#10b981" style={{ marginBottom: '8px' }} />
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
          Engines Operational
        </div>
        <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '4px' }}>
          Semgrep, Bandit, detect-secrets, and OSV Scanner are active.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {scanners.map((scanner) => {
        const isOperational = scanner.status === 'healthy' || scanner.status === 'operational';
        return (
          <div
            key={scanner.engine_key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderRadius: '4px',
              background: '#1f1f23',
              border: '1px solid rgba(62, 73, 72, 0.4)',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              {isOperational ? (
                <CheckCircle2 size={16} color="#8bdfdd" style={{ flexShrink: 0 }} />
              ) : (
                <AlertCircle size={16} color="#ffb4a6" style={{ flexShrink: 0 }} />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#e3e2e6', fontFamily: "'Space Grotesk', sans-serif" }}>
                    {scanner.name}
                  </span>
                  {scanner.version && (
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '1px 5px',
                        borderRadius: '2px',
                        background: 'rgba(139, 223, 221, 0.1)',
                        color: '#8bdfdd',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: 600,
                        border: '1px solid rgba(139, 223, 221, 0.3)',
                      }}
                    >
                      {scanner.version}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: '#bdc9c8', marginTop: '1px', fontFamily: "'Inter', sans-serif" }}>
                  {scanner.description}
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: '10px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: scanner.findings_count > 0 ? '#ffb4a6' : '#8bdfdd',
                }}
              >
                {scanner.findings_count > 0 ? `${scanner.findings_count} finding${scanner.findings_count === 1 ? '' : 's'}` : '0 findings (Active)'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
