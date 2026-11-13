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
        background: '#1b1b1f',
        border: '1px solid rgba(62, 73, 72, 0.45)',
        borderRadius: '4px',
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
        minHeight,
        height: '100%',
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
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2
            style={{
              fontSize: '14.5px',
              fontWeight: 600,
              color: '#FAF0E6',
              letterSpacing: '0.01em',
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
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
                color: '#889392',
                cursor: 'help',
                padding: '2px',
                borderRadius: '4px',
                transition: 'color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#8bdfdd')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#889392')}
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
