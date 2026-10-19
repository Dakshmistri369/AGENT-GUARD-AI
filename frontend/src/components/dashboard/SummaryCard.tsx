import React from 'react';
import { motion } from 'motion/react';

export interface SummaryCardProps {
  title: string;
  value: string | number;
  subtext: string;
  accentColor?: string;
  badge?: string;
  badgeColor?: string;
  onClick?: () => void;
  isLoading?: boolean;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({
  title,
  value,
  subtext,
  accentColor = '#3b82f6',
  badge,
  badgeColor = '#2dd4bf',
  onClick,
  isLoading = false,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={onClick ? { y: -2, borderColor: accentColor } : undefined}
      onClick={onClick}
      style={{
        background: 'linear-gradient(145deg, rgba(13, 23, 42, 0.9) 0%, rgba(7, 14, 27, 0.95) 100%)',
        border: '1px solid rgba(30, 58, 110, 0.45)',
        borderRadius: '12px',
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
        position: 'relative',
        overflow: 'hidden',
        minHeight: '130px',
      }}
    >
      {/* Top accent glow line */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '2px',
          background: `linear-gradient(90deg, transparent 0%, ${accentColor} 50%, transparent 100%)`,
          opacity: 0.7,
        }}
      />

      {/* Card Header: Title & optional badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: '#94a3b8',
            letterSpacing: '0.2px',
          }}
        >
          {title}
        </span>
        {badge && (
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '9999px',
              background: `${badgeColor}18`,
              color: badgeColor,
              border: `1px solid ${badgeColor}35`,
              fontWeight: 600,
            }}
          >
            {badge}
          </span>
        )}
      </div>

      {/* Primary Value & Subtext (exact Zeropath style) */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', marginTop: 'auto' }}>
        <div
          style={{
            fontSize: '36px',
            fontWeight: 800,
            color: '#f8fafc',
            lineHeight: 1,
            letterSpacing: '-0.8px',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          {isLoading ? (
            <div
              className="animate-spin"
              style={{
                width: '28px',
                height: '28px',
                border: '3px solid rgba(59, 130, 246, 0.2)',
                borderTopColor: accentColor,
                borderRadius: '50%',
                margin: '4px 0',
              }}
            />
          ) : (
            value
          )}
        </div>

        <div
          style={{
            fontSize: '12px',
            color: '#94a3b8',
            lineHeight: 1.45,
            maxWidth: '240px',
            flex: 1,
          }}
        >
          {subtext}
        </div>
      </div>
    </motion.div>
  );
};
