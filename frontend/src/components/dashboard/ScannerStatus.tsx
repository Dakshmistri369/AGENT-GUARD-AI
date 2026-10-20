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
              background: '#f1f5f9',
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
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              transition: 'background 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              {isOperational ? (
                <CheckCircle2 size={16} color="#059669" style={{ flexShrink: 0 }} />
              ) : (
                <AlertCircle size={16} color="#d97706" style={{ flexShrink: 0 }} />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                    {scanner.name}
                  </span>
                  {scanner.version && (
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: '#eff6ff',
                        color: '#2563eb',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontWeight: 600,
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
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: scanner.findings_count > 0 ? '#b45309' : '#059669',
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
