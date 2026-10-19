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
        background: 'linear-gradient(145deg, rgba(13, 23, 42, 0.85) 0%, rgba(6, 13, 25, 0.95) 100%)',
        border: '1px solid rgba(30, 58, 110, 0.45)',
        borderRadius: '12px',
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3)',
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
              fontWeight: 600,
              color: '#f1f5f9',
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
              onMouseEnter={(e) => (e.currentTarget.style.color = '#94a3b8')}
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
