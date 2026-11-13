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
              borderRadius: '8px',
              background: 'rgba(10, 18, 32, 0.7)',
              border: '1px solid rgba(56, 189, 248, 0.18)',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              {isOperational ? (
                <CheckCircle2 size={16} color="#10b981" style={{ flexShrink: 0 }} />
              ) : (
                <AlertCircle size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
                    {scanner.name}
                  </span>
                  {scanner.version && (
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: 'rgba(0, 240, 255, 0.12)',
                        color: '#00f0ff',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontWeight: 600,
                        border: '1px solid rgba(0, 240, 255, 0.25)',
                      }}
                    >
                      {scanner.version}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: '#ffffff', opacity: 0.9, marginTop: '1px' }}>
                  {scanner.description}
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: '10px' }}>
              <span
                style={{
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: scanner.findings_count > 0 ? '#fcd34d' : '#34d399',
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
