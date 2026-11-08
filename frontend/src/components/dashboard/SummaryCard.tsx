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
  accentColor = '#00f0ff',
  bgColor,
  borderColor,
  badge,
  badgeColor,
  onClick,
  isLoading = false,
}) => {
  // Use cyber dark background with subtle tinting
  const computedBg =
    bgColor && bgColor !== '#ffffff'
      ? bgColor
      : 'rgba(10, 18, 32, 0.85)';

  const computedBorder =
    borderColor && borderColor !== '#e2e8f0'
      ? borderColor
      : 'rgba(56, 189, 248, 0.18)';

  const activeBadgeColor = badgeColor || accentColor;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={onClick ? { y: -2, borderColor: accentColor, boxShadow: `0 8px 24px -4px ${accentColor}25` } : undefined}
      onClick={onClick}
      style={{
        background: computedBg,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${computedBorder}`,
        borderRadius: '12px',
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.5), 0 0 1px 1px rgba(56, 189, 248, 0.08)',
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
          height: '3px',
          background: accentColor,
          boxShadow: `0 0 10px ${accentColor}`,
        }}
      />

      {/* Card Header: Title & optional badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span
          style={{
            fontSize: '13.5px',
            fontWeight: 700,
            color: '#ffffff',
            letterSpacing: '0.3px',
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
              background: 'rgba(15, 23, 42, 0.85)',
              color: activeBadgeColor,
              border: `1px solid ${activeBadgeColor}60`,
              fontWeight: 700,
              boxShadow: `0 0 8px ${activeBadgeColor}20`,
            }}
          >
            {badge}
          </span>
        )}
      </div>

      {/* Primary Value & Subtext in crisp Cyber font */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', marginTop: 'auto' }}>
        <div
          style={{
            fontSize: '36px',
            fontWeight: 800,
            color: '#ffffff',
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
                background: 'rgba(56, 189, 248, 0.2)',
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
            color: '#cbd5e1',
            lineHeight: 1.5,
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
