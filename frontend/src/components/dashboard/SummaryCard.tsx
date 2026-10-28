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
  accentColor = '#2563eb',
  bgColor,
  borderColor,
  badge,
  badgeColor,
  onClick,
  isLoading = false,
}) => {
  // Select distinct subtle background tints based on accent color
  const computedBg =
    bgColor ||
    (accentColor.includes('3b82f6') || accentColor.includes('2563eb')
      ? '#f0f7ff'
      : accentColor.includes('2dd4bf') || accentColor.includes('10b981') || accentColor.includes('0d9488')
      ? '#f0fdf4'
      : accentColor.includes('f59e0b') || accentColor.includes('d97706')
      ? '#fffbeb'
      : accentColor.includes('8b5cf6') || accentColor.includes('7c3aed')
      ? '#faf5ff'
      : '#ffffff');

  const computedBorder =
    borderColor ||
    (accentColor.includes('3b82f6') || accentColor.includes('2563eb')
      ? '#bfdbfe'
      : accentColor.includes('2dd4bf') || accentColor.includes('10b981') || accentColor.includes('0d9488')
      ? '#bbf7d0'
      : accentColor.includes('f59e0b') || accentColor.includes('d97706')
      ? '#fde68a'
      : accentColor.includes('8b5cf6') || accentColor.includes('7c3aed')
      ? '#e9d5ff'
      : '#e2e8f0');

  const activeBadgeColor = badgeColor || accentColor;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={onClick ? { y: -2, borderColor: accentColor } : undefined}
      onClick={onClick}
      style={{
        background: computedBg,
        border: `1px solid ${computedBorder}`,
        borderRadius: '12px',
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
        position: 'relative',
        overflow: 'hidden',
        minHeight: '130px',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Top accent bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          background: accentColor,
        }}
      />

      {/* Card Header: Title & optional badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: '#475569',
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
              background: '#ffffff',
              color: activeBadgeColor,
              border: `1px solid ${activeBadgeColor}50`,
              fontWeight: 700,
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
          >
            {badge}
          </span>
        )}
      </div>

      {/* Primary Value & Subtext in Black font */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', marginTop: 'auto' }}>
        <div
          style={{
            fontSize: '36px',
            fontWeight: 800,
            color: '#0f172a',
            lineHeight: 1,
            letterSpacing: '-0.8px',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          {isLoading && (value === undefined || value === '—') ? (
            <div
              className="animate-pulse"
              style={{
                width: '42px',
                height: '32px',
                borderRadius: '6px',
                background: 'rgba(148, 163, 184, 0.25)',
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
            color: '#334155',
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
