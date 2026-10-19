import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

export type LogoScanState = 'idle' | 'scanning' | 'completed' | 'failed';

export interface AnimatedBrandLogoProps {
  variant?: 'icon' | 'full';
  size?: 'sm' | 'md' | 'lg';
  scanState?: LogoScanState;
  findingsCount?: number;
  className?: string;
  onClick?: () => void;
}

export const AnimatedBrandLogo: React.FC<AnimatedBrandLogoProps> = ({
  variant = 'full',
  size = 'md',
  scanState = 'idle',
  findingsCount = 0,
  className = '',
  onClick,
}) => {
  const shouldReduceMotion = useReducedMotion();

  // Sizing definitions
  const dimensions = {
    sm: { box: 30, icon: 20, fontTitle: '13px', fontSub: '9px', gap: '8px' },
    md: { box: 38, icon: 26, fontTitle: '15px', fontSub: '9.5px', gap: '10px' },
    lg: { box: 52, icon: 36, fontTitle: '18px', fontSub: '11px', gap: '14px' },
  }[size];

  const isScanning = scanState === 'scanning' && !shouldReduceMotion;
  const isCompleted = scanState === 'completed';
  const isFailed = scanState === 'failed';

  return (
    <div
      className={`inline-flex items-center select-none ${className}`}
      style={{
        gap: dimensions.gap,
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
      }}
      onClick={onClick}
      role="banner"
      aria-label={`AgentGuard AI Logo${scanState !== 'idle' ? ` - Status: ${scanState}` : ''}`}
    >
      {/* Emblem Shield with Dynamic Cyber Security Perimeter */}
      <motion.div
        initial={shouldReduceMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        whileHover={shouldReduceMotion ? undefined : { scale: 1.04 }}
        style={{
          width: `${dimensions.box}px`,
          height: `${dimensions.box}px`,
          position: 'relative',
          borderRadius: '10px',
          background: 'linear-gradient(145deg, #07152b 0%, #030a16 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isScanning
            ? '0 0 20px rgba(45, 212, 191, 0.5), inset 0 0 12px rgba(59, 130, 246, 0.3)'
            : isCompleted
            ? '0 0 16px rgba(16, 185, 129, 0.4)'
            : isFailed
            ? '0 0 16px rgba(244, 63, 94, 0.4)'
            : '0 0 12px rgba(20, 184, 166, 0.25)',
          overflow: 'hidden',
          flexShrink: 0,
          border: isScanning
            ? '1px solid #2dd4bf'
            : isCompleted
            ? '1px solid #10b981'
            : isFailed
            ? '1px solid #f43f5e'
            : '1px solid rgba(45, 212, 191, 0.35)',
          transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
        }}
      >
        {/* SVG Perimeter Circuit Nodes */}
        <svg
          viewBox="0 0 40 40"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
          aria-hidden="true"
        >
          {/* Subtle Cyber Corner Accents */}
          <path
            d="M 4 10 L 4 4 L 10 4"
            fill="none"
            stroke="rgba(45, 212, 191, 0.6)"
            strokeWidth="1.2"
          />
          <path
            d="M 30 4 L 36 4 L 36 10"
            fill="none"
            stroke="rgba(45, 212, 191, 0.6)"
            strokeWidth="1.2"
          />
          <path
            d="M 4 30 L 4 36 L 10 36"
            fill="none"
            stroke="rgba(45, 212, 191, 0.6)"
            strokeWidth="1.2"
          />
          <path
            d="M 30 36 L 36 36 L 36 30"
            fill="none"
            stroke="rgba(45, 212, 191, 0.6)"
            strokeWidth="1.2"
          />

          {/* Animated perimeter trace during scan */}
          {isScanning && (
            <motion.rect
              x="2"
              y="2"
              width="36"
              height="36"
              rx="8"
              fill="none"
              stroke="#2dd4bf"
              strokeWidth="1.5"
              strokeDasharray="16 32"
              animate={{ strokeDashoffset: [0, -96] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
            />
          )}
        </svg>

        {/* Existing Authentic Brand Icon Asset */}
        <img
          src="/logo-icon.png"
          alt="AgentGuard Security Shield"
          style={{
            width: `${dimensions.icon}px`,
            height: `${dimensions.icon}px`,
            objectFit: 'contain',
            zIndex: 1,
            filter: isScanning
              ? 'drop-shadow(0 0 6px rgba(45, 212, 191, 0.8))'
              : 'drop-shadow(0 0 3px rgba(20, 184, 166, 0.3))',
            transition: 'filter 0.3s ease',
          }}
        />

        {/* Active Laser Scan Line Sweeping Across Shield */}
        {isScanning && (
          <motion.div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              height: '3px',
              background: 'linear-gradient(90deg, transparent 0%, #2dd4bf 50%, transparent 100%)',
              boxShadow: '0 0 8px #2dd4bf',
              zIndex: 3,
            }}
            animate={{ top: ['0%', '100%', '0%'] }}
            transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
          />
        )}

        {/* Scan Status Badges (Completion / Failure indicators) */}
        {isCompleted && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(5, 13, 26, 0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 4,
            }}
          >
            <CheckCircle2 size={dimensions.icon} color="#10b981" />
          </motion.div>
        )}

        {isFailed && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(5, 13, 26, 0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 4,
            }}
          >
            <AlertTriangle size={dimensions.icon} color="#f43f5e" />
          </motion.div>
        )}
      </motion.div>

      {/* Full Wordmark Variant */}
      {variant === 'full' && (
        <motion.div
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}
        >
          <div
            style={{
              fontSize: dimensions.fontTitle,
              fontWeight: 800,
              color: '#f8fafc',
              lineHeight: 1.15,
              letterSpacing: '-0.3px',
              whiteSpace: 'nowrap',
            }}
          >
            AgentGuard{' '}
            <span
              style={{
                color: '#2dd4bf',
                textShadow: '0 0 10px rgba(45, 212, 191, 0.4)',
              }}
            >
              AI
            </span>
          </div>

          <div
            style={{
              fontSize: dimensions.fontSub,
              color: isScanning
                ? '#2dd4bf'
                : isCompleted
                ? '#10b981'
                : isFailed
                ? '#f43f5e'
                : '#94a3b8',
              fontWeight: 600,
              letterSpacing: '0.8px',
              textTransform: 'uppercase',
              lineHeight: 1.2,
              marginTop: '1.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {isScanning ? (
              <>
                <span
                  style={{
                    display: 'inline-block',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#2dd4bf',
                    boxShadow: '0 0 6px #2dd4bf',
                  }}
                  className="animate-ping"
                />
                Auditing Codebase…
              </>
            ) : isCompleted ? (
              <>
                <span
                  style={{
                    display: 'inline-block',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#10b981',
                  }}
                />
                Audit Verified {findingsCount > 0 ? `(${findingsCount})` : '(Clean)'}
              </>
            ) : isFailed ? (
              <>
                <span
                  style={{
                    display: 'inline-block',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#f43f5e',
                  }}
                />
                Audit Failed
              </>
            ) : (
              'Security Auditor'
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
};
