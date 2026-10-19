import React from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import type { ScannerHealthItem } from '../../types';

export interface ScannerStatusProps {
  scanners: ScannerHealthItem[];
  isLoading?: boolean;
}

export const ScannerStatus: React.FC<ScannerStatusProps> = ({ scanners, isLoading = false }) => {
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
              background: 'rgba(30, 58, 110, 0.25)',
            }}
          />
        ))}
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
              background: 'rgba(15, 23, 42, 0.5)',
              border: '1px solid rgba(30, 58, 110, 0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              {isOperational ? (
                <CheckCircle2 size={15} color="#10b981" style={{ flexShrink: 0 }} />
              ) : (
                <AlertCircle size={15} color="#f59e0b" style={{ flexShrink: 0 }} />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#f1f5f9' }}>
                    {scanner.name}
                  </span>
                  {scanner.version && (
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: 'rgba(59, 130, 246, 0.12)',
                        color: '#60a5fa',
                        fontFamily: 'JetBrains Mono, monospace',
                      }}
                    >
                      {scanner.version}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>
                  {scanner.description}
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: '10px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: scanner.findings_count > 0 ? '#fbbf24' : '#94a3b8',
                }}
              >
                {scanner.findings_count > 0 ? `${scanner.findings_count} findings` : 'Clean / 0 findings'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
