import React, { useState } from 'react';
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

const FALLBACK_LOGO_URL =
  'https://lh3.googleusercontent.com/aida/ALJJyrC3RLEPBOl36-hB8LBeir8ojnx7d30ejKvUnP-NE8gpCmgJiqeLU7ZEsfPrHPNwzx9qcdVH2aqdK11Ln4ku9SwEMFHEr-RFCouRDnwHrUoeaWdaLkbtY84kAwJvdx6My3QkwXEM24pIkeqFU_RO3YSFL42948oT8OhvmePtuD1TE4UlM6sC3P2qkC3kPBat6QPAGeLby7qRordexFTk3zdRPoeSyjwUqPYK7jRcPA2Tog';

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
  const currentStatus: LogoStatus = status || scanState || 'idle';
  const systemReducedMotion = useReducedMotion();
  const shouldReduceMotion = manualReducedMotion ?? systemReducedMotion ?? false;
  const [isHovered, setIsHovered] = useState(false);
  const [imgSrc, setImgSrc] = useState('/new-logo.png');

  // Sizing matrix adhering to Obsidian Sentinel density
  const dimensions = {
    xs: { iconSize: 26, titleSize: '13px', subSize: '8px', gap: '8px' },
    sm: { iconSize: 32, titleSize: '15px', subSize: '9px', gap: '10px' },
    md: { iconSize: 40, titleSize: '16px', subSize: '10px', gap: '12px' },
    lg: { iconSize: 52, titleSize: '22px', subSize: '11px', gap: '14px' },
    xl: { iconSize: 68, titleSize: '28px', subSize: '12px', gap: '16px' },
  }[size];

  const isScanning = currentStatus === 'scanning' && !shouldReduceMotion;
  const isAnalyzing = currentStatus === 'analyzing' && !shouldReduceMotion;
  const isCompleted = currentStatus === 'completed';
  const isCompletedWithFindings = currentStatus === 'completed-with-findings';
  const isFailed = currentStatus === 'failed';
  const isPartial = currentStatus === 'partial';

  return (
    <div
      className={`inline-flex items-center select-none ${className}`}
      style={{
        gap: dimensions.gap,
        cursor: onClick ? 'pointer' : interactive ? 'pointer' : 'default',
        position: 'relative',
        background: 'transparent',
      }}
      onClick={onClick}
      onMouseEnter={() => interactive && setIsHovered(true)}
      onMouseLeave={() => interactive && setIsHovered(false)}
      role="banner"
      aria-label={`AgentGuard AI Logo - Status: ${currentStatus}`}
    >
      {/* ── EMBLEM CONTAINER: CYBER SHIELD INSIGNIA WITH TACTICAL FRAME ── */}
      <motion.div
        animate={
          shouldReduceMotion
            ? {}
            : isHovered
            ? { y: -1, scale: 1.04 }
            : isAnalyzing
            ? { scale: [1, 1.03, 1], transition: { repeat: Infinity, duration: 2.2, ease: 'easeInOut' } }
            : { y: 0, scale: 1 }
        }
        transition={{ duration: 0.2, ease: 'easeOut' }}
        style={{
          width: `${dimensions.iconSize}px`,
          height: `${dimensions.iconSize}px`,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          borderRadius: '4px',
          border: '1px solid rgba(62, 73, 72, 0.5)',
          padding: '2px',
          backgroundColor: '#1b1b1f',
          boxShadow: isScanning
            ? '0 0 14px rgba(139, 223, 221, 0.45)'
            : isAnalyzing
            ? '0 0 14px rgba(167, 252, 250, 0.55)'
            : isHovered
            ? '0 0 12px rgba(139, 223, 221, 0.25)'
            : 'none',
          overflow: 'hidden',
          transition: 'box-shadow 0.25s ease, border-color 0.25s ease',
        }}
      >
        <img
          src={imgSrc}
          alt="AgentGuard AI Cyber Shield Insignia with futuristic glowing cyan and crimson lock emblem"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block',
          }}
          onError={() => {
            if (imgSrc !== FALLBACK_LOGO_URL) {
              setImgSrc(FALLBACK_LOGO_URL);
            }
          }}
        />

        {/* Tactical sweep pulse when scanning / analyzing */}
        {(isScanning || isAnalyzing) && (
          <div
            className="animate-radar"
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(135deg, rgba(167, 252, 250, 0.35) 0%, transparent 65%)',
              pointerEvents: 'none',
            }}
          />
        )}

        {/* ── STATUS BADGE CORNER OVERLAY ── */}
        <AnimatePresence>
          {isCompleted && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                position: 'absolute',
                bottom: '-2px',
                right: '-2px',
                background: '#006463',
                border: '1px solid #8bdfdd',
                borderRadius: '50%',
                padding: '1.5px',
                boxShadow: '0 0 6px rgba(139, 223, 221, 0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 5,
              }}
              title="Clean scan completed — Zero security findings"
            >
              <CheckCircle2 size={10} color="#a7fcfa" strokeWidth={3} />
            </motion.div>
          )}

          {isCompletedWithFindings && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                position: 'absolute',
                bottom: '-3px',
                right: '-3px',
                background: '#8f1103',
                border: '1px solid #ffb4a6',
                color: '#ffe8e4',
                borderRadius: '4px',
                padding: '0.5px 3.5px',
                fontSize: '8.5px',
                fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                boxShadow: '0 0 8px rgba(240, 89, 65, 0.6)',
                display: 'flex',
                alignItems: 'center',
                gap: '1px',
                zIndex: 5,
              }}
              title={`Scan completed with ${findingsCount} security finding${findingsCount !== 1 ? 's' : ''}`}
            >
              <AlertTriangle size={8} strokeWidth={2.5} color="#ffe8e4" />
              <span>{findingsCount > 0 ? findingsCount : '!'}</span>
            </motion.div>
          )}

          {isFailed && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                position: 'absolute',
                bottom: '-2px',
                right: '-2px',
                background: '#93000a',
                border: '1px solid #ffb4ab',
                borderRadius: '50%',
                padding: '1.5px',
                boxShadow: '0 0 8px rgba(147, 0, 10, 0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 5,
              }}
              title="Scan execution encountered errors"
            >
              <AlertCircle size={10} color="#ffb4ab" strokeWidth={3} />
            </motion.div>
          )}

          {isPartial && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                position: 'absolute',
                bottom: '-2px',
                right: '-2px',
                background: '#00504f',
                border: '1px solid #81d5d3',
                borderRadius: '50%',
                padding: '1.5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 5,
              }}
              title="Partial scan executed"
            >
              <Clock size={10} color="#81d5d3" strokeWidth={2.5} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── TYPOGRAPHY: SPACE GROTESK TITLE + JETBRAINS MONO SUBTITLE ── */}
      {variant === 'full' && (
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Main Title Row: AgentGuard AI in Space Grotesk */}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '4px',
              lineHeight: 1.15,
            }}
          >
            <span
              style={{
                fontSize: dimensions.titleSize,
                fontWeight: 700,
                color: '#e3e2e6',
                letterSpacing: '-0.01em',
                fontFamily: "'Space Grotesk', system-ui, -apple-system, sans-serif",
              }}
            >
              AgentGuard AI
            </span>
          </div>

          {/* Subtitle: "// AUTONOMOUS SECURITY" in JetBrains Mono */}
          {showSubtitle && (
            <span
              style={{
                fontSize: dimensions.subSize,
                fontWeight: 600,
                color: '#8bdfdd',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginTop: '2px',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              // AUTONOMOUS SECURITY
            </span>
          )}
        </div>
      )}
    </div>
  );
};
