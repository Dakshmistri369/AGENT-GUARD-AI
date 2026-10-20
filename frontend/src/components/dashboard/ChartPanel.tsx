import React from 'react';
import { Info } from 'lucide-react';
import { motion } from 'motion/react';

export interface ChartPanelProps {
  title: string;
  infoTooltip?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  minHeight?: string;
}

export const ChartPanel: React.FC<ChartPanelProps> = ({
  title,
  infoTooltip,
  action,
  children,
  className = '',
  minHeight = '300px',
}) => {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
        minHeight,
        position: 'relative',
      }}
      className={className}
    >
      {/* Panel Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '18px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2
            style={{
              fontSize: '14px',
              fontWeight: 700,
              color: '#0f172a',
              letterSpacing: '-0.1px',
              margin: 0,
            }}
          >
            {title}
          </h2>
          {infoTooltip && (
            <div
              title={infoTooltip}
              style={{
                display: 'inline-flex',
                color: '#64748b',
                cursor: 'help',
                padding: '2px',
                borderRadius: '4px',
                transition: 'color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              aria-label={infoTooltip}
            >
              <Info size={14} />
            </div>
          )}
        </div>

        {action && <div>{action}</div>}
      </div>

      {/* Panel Body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </motion.section>
  );
};
