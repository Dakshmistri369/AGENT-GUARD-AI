import React from 'react';
import { motion } from 'motion/react';

export interface SummaryCardProps {
  title: string;
  value: string | number;
  subtext: string;
  accentColor?: string;
  bgColor?: string;
  borderColor?: string;
  badge?: string;
  badgeColor?: string;
  onClick?: () => void;
  isLoading?: boolean;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({
  title,
  value,
  subtext,
  accentColor = '#8bdfdd',
  bgColor,
  borderColor,
  badge,
  badgeColor,
  onClick,
  isLoading = false,
}) => {
  // Use Obsidian Sentinel surface-container-low background
  const computedBg =
    bgColor && bgColor !== '#ffffff' && !bgColor.includes('rgba(10, 18, 32')
      ? bgColor
      : '#1b1b1f';

  const computedBorder =
    borderColor && borderColor !== '#e2e8f0' && !borderColor.includes('56, 189, 248')
      ? borderColor
      : 'rgba(62, 73, 72, 0.45)';

  const activeBadgeColor = badgeColor || accentColor;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={onClick ? { y: -2, borderColor: accentColor, boxShadow: `0 8px 24px -4px ${accentColor}35, 0 0 16px ${accentColor}20` } : undefined}
      onClick={onClick}
      style={{
        background: computedBg,
        border: `1px solid ${computedBorder}`,
        borderRadius: '4px',
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
        position: 'relative',
        overflow: 'hidden',
        minHeight: '130px',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Top glowing cyber accent bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '2px',
          background: accentColor,
          boxShadow: `0 0 8px ${accentColor}`,
        }}
      />

      {/* Cyber HUD Corner Accent */}
      <div
        style={{
          position: 'absolute',
          top: '4px',
          right: '4px',
          width: '5px',
          height: '5px',
          borderTop: `1px solid ${accentColor}`,
          borderRight: `1px solid ${accentColor}`,
          opacity: 0.7,
        }}
      />

      {/* Card Header: Title & optional badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span
          style={{
            fontSize: '13.5px',
            fontWeight: 600,
            color: '#e3e2e6',
            letterSpacing: '0.01em',
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
          }}
        >
          {title}
        </span>
        {badge && (
          <span
            style={{
              fontSize: '10.5px',
              padding: '1.5px 7px',
              borderRadius: '2px',
              background: 'rgba(13, 14, 17, 0.85)',
              color: activeBadgeColor,
              border: `1px solid ${activeBadgeColor}50`,
              fontWeight: 600,
              fontFamily: "'JetBrains Mono', monospace",
              boxShadow: `0 0 6px ${activeBadgeColor}20`,
            }}
          >
            {badge}
          </span>
        )}
      </div>

      {/* Primary Value & Subtext in crisp Linen/White fonts */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', marginTop: 'auto' }}>
        <div
          style={{
            fontSize: '34px',
            fontWeight: 700,
            color: '#FAF0E6',
            lineHeight: 1,
            letterSpacing: '-0.02em',
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
          }}
        >
          {isLoading && (value === undefined || value === '—') ? (
            <div
              className="animate-pulse"
              style={{
                width: '42px',
                height: '32px',
                borderRadius: '4px',
                background: 'rgba(139, 223, 221, 0.2)',
                margin: '2px 0',
              }}
            />
          ) : (
            <span className={isLoading ? 'opacity-80 transition-opacity' : ''}>{value ?? 0}</span>
          )}
        </div>

        <div
          style={{
            fontSize: '12px',
            color: '#bdc9c8',
            lineHeight: 1.45,
            maxWidth: '240px',
            flex: 1,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {subtext}
        </div>
      </div>
    </motion.div>
  );
};
