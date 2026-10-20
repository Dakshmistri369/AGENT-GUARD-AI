import React, { useState, useEffect } from 'react';
import { motion, useReducedMotion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertTriangle, AlertCircle, Clock } from 'lucide-react';

export type LogoStatus =
  | 'idle'
  | 'scanning'
  | 'analyzing'
  | 'completed'
  | 'completed-with-findings'
  | 'failed'
  | 'partial';

// Backward compatibility alias for existing usages
export type LogoScanState = LogoStatus;

export type LogoVariant = 'full' | 'icon';
export type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface AnimatedBrandLogoProps {
  variant?: LogoVariant;
  size?: LogoSize;
  status?: LogoStatus;
  /** Backward-compatible alias for status */
  scanState?: LogoStatus;
  findingsCount?: number;
  interactive?: boolean;
  reducedMotion?: boolean;
  className?: string;
  onClick?: () => void;
  showSubtitle?: boolean;
}

// Track whether the one-time intelligent entrance reveal has already played in this browser session
let hasPlayedSessionReveal = false;

export const AnimatedBrandLogo: React.FC<AnimatedBrandLogoProps> = ({
  variant = 'full',
  size = 'md',
  status,
  scanState,
  findingsCount = 0,
  interactive = true,
  reducedMotion: manualReducedMotion,
  className = '',
  onClick,
  showSubtitle = true,
}) => {
  // Normalize status prop (prefer status, fallback to scanState, fallback to idle)
  const currentStatus: LogoStatus = status || scanState || 'idle';

  // Reduced motion preference
  const systemReducedMotion = useReducedMotion();
  const shouldReduceMotion = manualReducedMotion ?? systemReducedMotion ?? false;

  // Track if this instance should play the full entrance animation
  const [shouldAnimateEntrance, setShouldAnimateEntrance] = useState<boolean>(() => {
    if (shouldReduceMotion) return false;
    if (typeof window !== 'undefined' && window.sessionStorage.getItem('agentguard_logo_revealed')) {
      return false;
    }
    return !hasPlayedSessionReveal;
  });

  useEffect(() => {
    if (shouldAnimateEntrance) {
      hasPlayedSessionReveal = true;
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('agentguard_logo_revealed', 'true');
      }
      // Entrance finishes in ~1.4s
      const timer = setTimeout(() => {
        setShouldAnimateEntrance(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [shouldAnimateEntrance]);

  // Hover state
  const [isHovered, setIsHovered] = useState(false);

  // Sizing matrix
  const dimensions = {
    xs: { iconWidth: 24, iconHeight: 26, titleSize: '13px', subSize: '7.5px', gap: '8px' },
    sm: { iconWidth: 32, iconHeight: 34, titleSize: '15px', subSize: '8.5px', gap: '10px' },
    md: { iconWidth: 42, iconHeight: 45, titleSize: '18px', subSize: '9.5px', gap: '12px' },
    lg: { iconWidth: 58, iconHeight: 62, titleSize: '24px', subSize: '11px', gap: '14px' },
    xl: { iconWidth: 76, iconHeight: 82, titleSize: '30px', subSize: '13px', gap: '18px' },
  }[size];

  const isScanning = currentStatus === 'scanning' && !shouldReduceMotion;
  const isAnalyzing = currentStatus === 'analyzing' && !shouldReduceMotion;
  const isCompleted = currentStatus === 'completed';
  const isCompletedWithFindings = currentStatus === 'completed-with-findings';
  const isFailed = currentStatus === 'failed';
  const isPartial = currentStatus === 'partial';

  // Base transition timings for Animation A (Reveal)
  const revealTransition = (delay: number, duration: number = 0.5) =>
    shouldAnimateEntrance
      ? { delay, duration, ease: [0.16, 1, 0.3, 1] as const }
      : { duration: 0.2 };

  return (
    <div
      className={`inline-flex items-center select-none ${className}`}
      style={{
        gap: dimensions.gap,
        cursor: onClick ? 'pointer' : interactive ? 'default' : 'default',
        position: 'relative',
        background: 'transparent',
      }}
      onClick={onClick}
      onMouseEnter={() => interactive && setIsHovered(true)}
      onMouseLeave={() => interactive && setIsHovered(false)}
      role="banner"
      aria-label={`AgentGuard AI Logo - Status: ${currentStatus}`}
    >
      {/* ── EMBLEM CONTAINER WITH INTERACTIVE HOVER & SCAN/AI SHADOWS ── */}
      <motion.div
        animate={
          shouldReduceMotion
            ? {}
            : isHovered
            ? { y: -2, scale: 1.03 }
            : isAnalyzing
            ? { scale: [1, 1.015, 1], transition: { repeat: Infinity, duration: 2.4, ease: 'easeInOut' } }
            : { y: 0, scale: 1 }
        }
        transition={{ duration: 0.25, ease: 'easeOut' }}
        style={{
          width: `${dimensions.iconWidth}px`,
          height: `${dimensions.iconHeight}px`,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          filter: isAnalyzing
            ? 'drop-shadow(0 0 12px rgba(124, 58, 237, 0.45))'
            : isScanning
            ? 'drop-shadow(0 0 10px rgba(6, 182, 212, 0.45))'
            : isCompleted
            ? 'drop-shadow(0 0 8px rgba(16, 185, 129, 0.35))'
            : isCompletedWithFindings
            ? 'drop-shadow(0 0 8px rgba(245, 158, 11, 0.35))'
            : isFailed
            ? 'drop-shadow(0 0 8px rgba(244, 63, 94, 0.4))'
            : isHovered
            ? 'drop-shadow(0 4px 10px rgba(15, 23, 42, 0.12))'
            : 'none',
          transition: 'filter 0.3s ease',
        }}
      >
        {/* ── VECTOR SHIELD ICON (Precise Geometric SVG Trace) ── */}
        <svg
          viewBox="0 0 200 215"
          style={{
            width: '100%',
            height: '100%',
            overflow: 'visible',
          }}
          aria-hidden="true"
        >
          <defs>
            {/* Scan Beam Gradient */}
            <linearGradient id="ag-scan-beam" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0" />
              <stop offset="25%" stopColor="#06b6d4" stopOpacity="0.85" />
              <stop offset="65%" stopColor="#8b5cf6" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
            </linearGradient>

            {/* AI Violet Glow Gradient */}
            <radialGradient id="ag-ai-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.6" />
              <stop offset="70%" stopColor="#6366f1" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </radialGradient>

            {/* Shield Interior ClipPath for Scan Sweep */}
            <clipPath id="ag-shield-interior-clip">
              <path d="M 88 12 L 20 32 L 20 114 C 20 152, 50 182, 88 200 C 126 182, 156 152, 156 114 L 156 32 Z" />
            </clipPath>
          </defs>

          {/* ── LAYER 1: OUTER SHIELD OUTLINE (Animated Stroke) ── */}
          {/* Left Perimeter */}
          <motion.path
            d="M 88 8 L 14 29 L 14 116 C 14 158, 48 188, 88 206"
            fill="none"
            stroke="#0f172a"
            strokeWidth="9.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={shouldAnimateEntrance ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={revealTransition(0.05, 0.65)}
          />

          {/* Right Upper Perimeter (breaks for top-right circuit) */}
          <motion.path
            d="M 88 8 L 132 21 M 145 25 L 164 30 L 164 68"
            fill="none"
            stroke="#0f172a"
            strokeWidth="9.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={shouldAnimateEntrance ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={revealTransition(0.12, 0.6)}
          />

          {/* Right Lower Perimeter (curves down to bottom tip) */}
          <motion.path
            d="M 164 104 C 164 135, 148 168, 88 206"
            fill="none"
            stroke="#0f172a"
            strokeWidth="9.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={shouldAnimateEntrance ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={revealTransition(0.2, 0.55)}
          />

          {/* ── LAYER 2: CENTRAL STYLIZED 'A' ── */}
          {/* Right Leg (Solid Bold Stroke) */}
          <motion.path
            d="M 88 38 L 142 142"
            fill="none"
            stroke="#0f172a"
            strokeWidth="13"
            strokeLinecap="round"
            initial={shouldAnimateEntrance ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={revealTransition(0.35, 0.5)}
          />

          {/* Left Leg Upper Segment */}
          <motion.path
            d="M 88 38 L 65 78"
            fill="none"
            stroke="#0f172a"
            strokeWidth="12"
            strokeLinecap="round"
            initial={shouldAnimateEntrance ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={revealTransition(0.4, 0.45)}
          />

          {/* Left Leg Lower Parallel Bars */}
          <motion.path
            d="M 54 98 L 34 140"
            fill="none"
            stroke="#0f172a"
            strokeWidth="8"
            strokeLinecap="round"
            initial={shouldAnimateEntrance ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={revealTransition(0.48, 0.4)}
          />
          <motion.path
            d="M 68 98 L 48 140"
            fill="none"
            stroke="#0f172a"
            strokeWidth="6"
            strokeLinecap="round"
            initial={shouldAnimateEntrance ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={revealTransition(0.52, 0.4)}
          />

          {/* ── LAYER 3: INTEGRATED CIRCUIT TRACES ── */}
          {/* Top-Right Lightning Trace */}
          <motion.path
            d="M 96 44 L 110 44 L 118 34 L 136 30 L 142 15"
            fill="none"
            stroke="#0f172a"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={shouldAnimateEntrance ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={revealTransition(0.58, 0.45)}
          />

          {/* Right Circuit Arm */}
          <motion.path
            d="M 134 94 L 155 88 L 172 80 L 186 62"
            fill="none"
            stroke="#0f172a"
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={shouldAnimateEntrance ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={revealTransition(0.65, 0.45)}
          />

          {/* Bottom-Left Circuit Arm */}
          <motion.path
            d="M 44 126 L 30 133 L 20 133 L 12 133"
            fill="none"
            stroke="#0f172a"
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={shouldAnimateEntrance ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={revealTransition(0.7, 0.45)}
          />

          {/* Internal Spine & Crossbar Track */}
          <motion.path
            d="M 85 185 L 85 160 L 87 128 L 108 112"
            fill="none"
            stroke="#0f172a"
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={shouldAnimateEntrance ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={revealTransition(0.75, 0.45)}
          />

          {/* ── LAYER 4: CONNECTION NODES (Sequentially Illuminated) ── */}
          {/* Node 1: Far Right External Terminal */}
          <motion.circle
            cx="186"
            cy="62"
            r="7"
            fill="#ffffff"
            stroke={isScanning ? '#06b6d4' : isHovered ? '#7c3aed' : '#0f172a'}
            strokeWidth="4.5"
            initial={shouldAnimateEntrance ? { scale: 0, opacity: 0 } : { scale: 1, opacity: 1 }}
            animate={
              isScanning
                ? { scale: [1, 1.35, 1], stroke: ['#06b6d4', '#8b5cf6', '#06b6d4'], transition: { repeat: Infinity, duration: 1.6, delay: 0.1 } }
                : isAnalyzing
                ? { scale: [1, 1.25, 1], stroke: '#7c3aed', transition: { repeat: Infinity, duration: 1.8 } }
                : { scale: 1, opacity: 1 }
            }
            transition={revealTransition(0.8, 0.35)}
          />
          <motion.circle
            cx="186"
            cy="62"
            r="2.5"
            fill={isScanning ? '#06b6d4' : isHovered ? '#7c3aed' : '#0f172a'}
            initial={shouldAnimateEntrance ? { scale: 0 } : { scale: 1 }}
            animate={{ scale: 1 }}
            transition={revealTransition(0.82, 0.3)}
          />

          {/* Node 2: Crossbar Connection Node */}
          <motion.circle
            cx="150"
            cy="94"
            r="5.5"
            fill="#ffffff"
            stroke={isScanning ? '#06b6d4' : '#0f172a'}
            strokeWidth="3.5"
            initial={shouldAnimateEntrance ? { scale: 0, opacity: 0 } : { scale: 1, opacity: 1 }}
            animate={
              isScanning
                ? { scale: [1, 1.3, 1], stroke: ['#06b6d4', '#8b5cf6', '#06b6d4'], transition: { repeat: Infinity, duration: 1.6, delay: 0.3 } }
                : { scale: 1, opacity: 1 }
            }
            transition={revealTransition(0.88, 0.3)}
          />

          {/* Node 3: Spine Upper Node */}
          <motion.circle
            cx="87"
            cy="128"
            r="5.5"
            fill="#ffffff"
            stroke={isScanning ? '#06b6d4' : isHovered ? '#06b6d4' : '#0f172a'}
            strokeWidth="3.5"
            initial={shouldAnimateEntrance ? { scale: 0, opacity: 0 } : { scale: 1, opacity: 1 }}
            animate={
              isScanning
                ? { scale: [1, 1.3, 1], stroke: ['#06b6d4', '#8b5cf6', '#06b6d4'], transition: { repeat: Infinity, duration: 1.6, delay: 0.5 } }
                : { scale: 1, opacity: 1 }
            }
            transition={revealTransition(0.94, 0.3)}
          />

          {/* Node 4: Far Left External Terminal */}
          <motion.circle
            cx="12"
            cy="133"
            r="7"
            fill="#ffffff"
            stroke={isScanning ? '#06b6d4' : '#0f172a'}
            strokeWidth="4.5"
            initial={shouldAnimateEntrance ? { scale: 0, opacity: 0 } : { scale: 1, opacity: 1 }}
            animate={
              isScanning
                ? { scale: [1, 1.35, 1], stroke: ['#06b6d4', '#8b5cf6', '#06b6d4'], transition: { repeat: Infinity, duration: 1.6, delay: 0.7 } }
                : { scale: 1, opacity: 1 }
            }
            transition={revealTransition(1.0, 0.3)}
          />
          <motion.circle
            cx="12"
            cy="133"
            r="2.5"
            fill={isScanning ? '#06b6d4' : '#0f172a'}
            initial={shouldAnimateEntrance ? { scale: 0 } : { scale: 1 }}
            animate={{ scale: 1 }}
            transition={revealTransition(1.02, 0.3)}
          />

          {/* Node 5: Spine Lower Node */}
          <motion.circle
            cx="85"
            cy="160"
            r="5.5"
            fill="#ffffff"
            stroke={isScanning ? '#06b6d4' : '#0f172a'}
            strokeWidth="3.5"
            initial={shouldAnimateEntrance ? { scale: 0, opacity: 0 } : { scale: 1, opacity: 1 }}
            animate={
              isScanning
                ? { scale: [1, 1.3, 1], stroke: ['#06b6d4', '#8b5cf6', '#06b6d4'], transition: { repeat: Infinity, duration: 1.6, delay: 0.9 } }
                : { scale: 1, opacity: 1 }
            }
            transition={revealTransition(1.06, 0.3)}
          />

          {/* ── LAYER 5: ANIMATION B — LIVE SECURITY SCAN SWEEP ── */}
          {isScanning && (
            <g clipPath="url(#ag-shield-interior-clip)">
              {/* Sweeping Horizontal Beam */}
              <motion.line
                x1="0"
                y1="0"
                x2="200"
                y2="0"
                stroke="url(#ag-scan-beam)"
                strokeWidth="4.5"
                initial={{ y: 10, opacity: 0.3 }}
                animate={{
                  y: [10, 195, 10],
                  opacity: [0.3, 0.95, 0.3],
                }}
                transition={{
                  repeat: Infinity,
                  duration: 2.2,
                  ease: 'easeInOut',
                }}
              />
              {/* Subtle Scan Glow Halo */}
              <motion.rect
                x="0"
                y="0"
                width="200"
                height="16"
                fill="url(#ag-scan-beam)"
                opacity="0.18"
                initial={{ y: 2 }}
                animate={{
                  y: [2, 187, 2],
                }}
                transition={{
                  repeat: Infinity,
                  duration: 2.2,
                  ease: 'easeInOut',
                }}
              />
            </g>
          )}

          {/* ── LAYER 6: ANIMATION C — AI ANALYSIS RADIANCE ── */}
          {isAnalyzing && (
            <motion.circle
              cx="88"
              cy="100"
              r="70"
              fill="url(#ag-ai-glow)"
              initial={{ scale: 0.85, opacity: 0.2 }}
              animate={{
                scale: [0.85, 1.15, 0.85],
                opacity: [0.2, 0.55, 0.2],
              }}
              transition={{
                repeat: Infinity,
                duration: 2.2,
                ease: 'easeInOut',
              }}
              style={{ pointerEvents: 'none' }}
            />
          )}
        </svg>

        {/* ── STATUS BADGE CORNER OVERLAY (Completed / Findings / Failed) ── */}
        <AnimatePresence>
          {isCompleted && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{
                position: 'absolute',
                bottom: '-3px',
                right: '-3px',
                background: '#10b981',
                borderRadius: '50%',
                padding: '2px',
                boxShadow: '0 2px 6px rgba(16, 185, 129, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Clean scan completed — Zero security findings"
            >
              <CheckCircle2 size={12} color="#ffffff" strokeWidth={3} />
            </motion.div>
          )}

          {isCompletedWithFindings && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{
                position: 'absolute',
                bottom: '-4px',
                right: '-5px',
                background: '#f59e0b',
                color: '#ffffff',
                borderRadius: '999px',
                padding: '1px 5px',
                fontSize: '9px',
                fontWeight: 800,
                boxShadow: '0 2px 6px rgba(245, 158, 11, 0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                lineHeight: '12px',
              }}
              title={`Scan completed with ${findingsCount} security finding${findingsCount !== 1 ? 's' : ''}`}
            >
              <AlertTriangle size={9} strokeWidth={2.5} />
              <span>{findingsCount > 0 ? findingsCount : '!'}</span>
            </motion.div>
          )}

          {isFailed && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{
                position: 'absolute',
                bottom: '-3px',
                right: '-3px',
                background: '#f43f5e',
                borderRadius: '50%',
                padding: '2px',
                boxShadow: '0 2px 6px rgba(244, 63, 94, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Scan execution encountered errors"
            >
              <AlertCircle size={12} color="#ffffff" strokeWidth={3} />
            </motion.div>
          )}

          {isPartial && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{
                position: 'absolute',
                bottom: '-3px',
                right: '-3px',
                background: '#0ea5e9',
                borderRadius: '50%',
                padding: '2px',
                boxShadow: '0 2px 6px rgba(14, 165, 233, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Partial scan executed"
            >
              <Clock size={11} color="#ffffff" strokeWidth={2.5} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── TYPOGRAPHY: AGENTGUARD WORDMARK + PURPLE AI + SUBTITLE ── */}
      {variant === 'full' && (
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Main Title Row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '4px',
              lineHeight: 1.1,
            }}
          >
            {/* "AgentGuard" — Black Sans-Serif */}
            <motion.span
              initial={shouldAnimateEntrance ? { opacity: 0, x: -8 } : { opacity: 1, x: 0 }}
              animate={{ opacity: 1, x: 0 }}
              transition={revealTransition(0.9, 0.4)}
              style={{
                fontSize: dimensions.titleSize,
                fontWeight: 800,
                color: '#0f172a',
                letterSpacing: '-0.035em',
                fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              }}
            >
              AgentGuard
            </motion.span>

            {/* "AI" — Vibrant Purple Lettering */}
            <motion.span
              initial={shouldAnimateEntrance ? { opacity: 0, scale: 0.85 } : { opacity: 1, scale: 1 }}
              animate={
                isHovered
                  ? { scale: 1.05, filter: 'drop-shadow(0 0 6px rgba(124, 58, 237, 0.4))' }
                  : isAnalyzing
                  ? {
                      scale: [1, 1.06, 1],
                      filter: ['drop-shadow(0 0 2px rgba(124, 58, 237, 0.3))', 'drop-shadow(0 0 10px rgba(124, 58, 237, 0.65))', 'drop-shadow(0 0 2px rgba(124, 58, 237, 0.3))'],
                      transition: { repeat: Infinity, duration: 2.0 },
                    }
                  : { opacity: 1, scale: 1, filter: 'none' }
              }
              transition={revealTransition(1.1, 0.4)}
              style={{
                fontSize: dimensions.titleSize,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                background: 'linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                display: 'inline-block',
                fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                transition: 'filter 0.25s ease',
              }}
            >
              AI
            </motion.span>
          </div>

          {/* Subtitle: "AI POWERED CODE SECURITY" */}
          {showSubtitle && (
            <motion.span
              initial={shouldAnimateEntrance ? { opacity: 0, y: 3 } : { opacity: 1, y: 0 }}
              animate={{ opacity: 1, y: 0 }}
              transition={revealTransition(1.25, 0.4)}
              style={{
                fontSize: dimensions.subSize,
                fontWeight: 700,
                color: '#64748b',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                marginTop: '3px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              }}
            >
              AI POWERED CODE SECURITY
            </motion.span>
          )}
        </div>
      )}
    </div>
  );
};
