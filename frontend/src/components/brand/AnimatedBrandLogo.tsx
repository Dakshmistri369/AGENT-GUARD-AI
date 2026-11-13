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
  /** Render mode: 'svg' for infinite resolution vector paths, 'image' for raster PNG */
  renderMode?: 'svg' | 'image';
}

const FALLBACK_LOGO_URL =
  'https://lh3.googleusercontent.com/aida/ALJJyrC3RLEPBOl36-hB8LBeir8ojnx7d30ejKvUnP-NE8gpCmgJiqeLU7ZEsfPrHPNwzx9qcdVH2aqdK11Ln4ku9SwEMFHEr-RFCouRDnwHrUoeaWdaLkbtY84kAwJvdx6My3QkwXEM24pIkeqFU_RO3YSFL42948oT8OhvmePtuD1TE4UlM6sC3P2qkC3kPBat6QPAGeLby7qRordexFTk3zdRPoeSyjwUqPYK7jRcPA2Tog';

/**
 * High-End Minimalist Modern Vector Mark for AgentGuard AI
 * Recreated from high_end_minimalist_modern_app_favicon_for_agentguard_ai_cybersecurity.png
 */
export const AgentGuardVectorMark: React.FC<{
  size?: number;
  className?: string;
  isScanning?: boolean;
  isAnalyzing?: boolean;
}> = ({ size = 40, className = '', isScanning = false, isAnalyzing = false }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      fill="none"
      style={{ overflow: 'visible', display: 'block' }}
      aria-hidden="true"
    >
      <defs>
        {/* Gradients: Left Cyan Hemisphere */}
        <linearGradient id="ag-svg-cyan" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#d6ffff" />
          <stop offset="40%" stopColor="#5eedee" />
          <stop offset="80%" stopColor="#00b4d8" />
          <stop offset="100%" stopColor="#0077b6" />
        </linearGradient>

        <linearGradient id="ag-svg-cyan-dark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#144d57" />
          <stop offset="100%" stopColor="#061c22" />
        </linearGradient>

        {/* Gradients: Right Coral/Crimson Hemisphere */}
        <linearGradient id="ag-svg-coral" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff0ec" />
          <stop offset="35%" stopColor="#ff9080" />
          <stop offset="70%" stopColor="#e63946" />
          <stop offset="100%" stopColor="#9b111e" />
        </linearGradient>

        <linearGradient id="ag-svg-coral-dark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5c1d1d" />
          <stop offset="100%" stopColor="#1e0808" />
        </linearGradient>

        {/* Gradients: Shackle Lock Top Arc */}
        <linearGradient id="ag-svg-shackle" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#00e5ff" />
          <stop offset="45%" stopColor="#99f6ff" />
          <stop offset="55%" stopColor="#ffd4cc" />
          <stop offset="100%" stopColor="#ff4d4d" />
        </linearGradient>

        {/* Gradients: Center Ruby Core Triangle */}
        <linearGradient id="ag-svg-ruby" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#ff5252" />
          <stop offset="50%" stopColor="#c62828" />
          <stop offset="100%" stopColor="#5f0909" />
        </linearGradient>

        {/* Metallic Highlights */}
        <linearGradient id="ag-svg-metal-light" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#c7d5df" />
          <stop offset="100%" stopColor="#8ba1b0" />
        </linearGradient>

        <linearGradient id="ag-svg-metal-dark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#708290" />
          <stop offset="100%" stopColor="#243038" />
        </linearGradient>

        {/* Dynamic Filter for Scanning & Analysis */}
        <filter id="ag-svg-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ── 01. TACTICAL HUD BACKGROUND FRAMING ── */}
      <g opacity="0.6">
        <circle cx="256" cy="256" r="204" stroke="rgba(139, 223, 221, 0.18)" strokeWidth="1.2" strokeDasharray="3 6" />
        <circle cx="256" cy="256" r="172" stroke="rgba(255, 180, 166, 0.15)" strokeWidth="1" />
        <line x1="88" y1="256" x2="114" y2="256" stroke="#00e5ff" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="398" y1="256" x2="424" y2="256" stroke="#ff5252" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="256" y1="446" x2="256" y2="468" stroke="rgba(227, 226, 230, 0.6)" strokeWidth="1.5" strokeLinecap="round" />

        {/* Tactical Corner Brackets */}
        <path d="M 124 160 L 124 124 L 160 124" fill="none" stroke="#5eedee" strokeWidth="2" strokeLinecap="square" />
        <path d="M 388 160 L 388 124 L 352 124" fill="none" stroke="#ff9080" strokeWidth="2" strokeLinecap="square" />
        <path d="M 124 352 L 124 388 L 160 388" fill="none" stroke="#5eedee" strokeWidth="2" strokeLinecap="square" />
        <path d="M 388 352 L 388 388 L 352 388" fill="none" stroke="#ff9080" strokeWidth="2" strokeLinecap="square" />

        {/* Ambient Stippled Particles */}
        <circle cx="140" cy="216" r="2.2" fill="#5eedee" opacity="0.8" />
        <circle cx="372" cy="216" r="2.5" fill="#ff5252" opacity="0.8" />
        <circle cx="148" cy="360" r="2.5" fill="#00e5ff" opacity="0.7" />
        <circle cx="364" cy="360" r="2" fill="#ff3b30" opacity="0.7" />
      </g>

      {/* ── 02. PADLOCK SHACKLE (CYBER ARCH ON TOP) ── */}
      <g>
        <path
          d="M 204 154
             C 204 110, 222 84, 256 84
             C 290 84, 308 110, 308 154
             L 292 154
             C 292 118, 278 100, 256 100
             C 234 100, 220 118, 220 154
             Z"
          fill="url(#ag-svg-shackle)"
        />
        <path
          d="M 204 154 C 204 110, 222 84, 256 84"
          fill="none"
          stroke="#d6ffff"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M 256 84 C 290 84, 308 110, 308 154"
          fill="none"
          stroke="#ff9080"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </g>

      {/* ── 03. OUTER SHIELD BASE & DUAL SPLIT BEZEL ── */}
      {/* Outer Chamber Dark Base */}
      <path
        d="M 152 176
           L 256 138
           L 360 176
           C 360 256, 332 350, 256 414
           C 180 350, 152 256, 152 176
           Z"
        fill="#08090c"
        stroke="#1a1e26"
        strokeWidth="10"
      />

      {/* Left Outer Shield Half: Cyan Luminous Stroke */}
      <path
        d="M 256 138
           L 152 176
           C 152 256, 180 350, 256 414
           L 256 398
           C 192 340, 168 254, 168 184
           L 256 150
           Z"
        fill="url(#ag-svg-cyan)"
        filter={isScanning ? 'url(#ag-svg-glow)' : undefined}
      />

      {/* Right Outer Shield Half: Coral/Crimson Luminous Stroke */}
      <path
        d="M 256 138
           L 360 176
           C 360 256, 332 350, 256 414
           L 256 398
           C 320 340, 344 254, 344 184
           L 256 150
           Z"
        fill="url(#ag-svg-coral)"
        filter={isAnalyzing ? 'url(#ag-svg-glow)' : undefined}
      />

      {/* Shield Chamber Floor */}
      <path
        d="M 256 152
           L 170 184
           C 170 252, 194 336, 256 394
           C 318 336, 342 252, 342 184
           Z"
        fill="#0d1017"
      />

      {/* ── 04. LOWER CIRCUIT TRACES & V-CHEVRONS ── */}
      <g opacity="0.85">
        <line x1="256" y1="298" x2="256" y2="348" stroke="#ff4d4d" strokeWidth="2.5" />
        <circle cx="256" cy="304" r="4" fill="#ff5252" stroke="#ffffff" strokeWidth="1.2" />

        {/* Left Traces */}
        <path d="M 250 318 L 230 318 L 222 304 L 198 304" fill="none" stroke="#00e5ff" strokeWidth="2" />
        <circle cx="198" cy="304" r="3" fill="#5eedee" />
        <path d="M 248 334 L 234 334 L 220 348 L 208 348" fill="none" stroke="#00e5ff" strokeWidth="1.8" />
        <circle cx="208" cy="348" r="2.5" fill="#5eedee" />

        {/* Right Traces */}
        <path d="M 262 318 L 282 318 L 290 304 L 314 304" fill="none" stroke="#ff7b6b" strokeWidth="2" />
        <circle cx="314" cy="304" r="3" fill="#ff7b6b" />
        <path d="M 264 334 L 278 334 L 292 348 L 304 348" fill="none" stroke="#ff7b6b" strokeWidth="1.8" />
        <circle cx="304" cy="348" r="2.5" fill="#ff7b6b" />

        {/* Concentric Lower V-Chevrons */}
        <path
          d="M 202 338 L 256 384 L 310 338 L 302 332 L 256 372 L 210 332 Z"
          fill="#830000"
          stroke="#ff3b30"
          strokeWidth="1.2"
        />
        <path
          d="M 218 344 L 256 376 L 294 344 L 290 338 L 256 366 L 222 338 Z"
          fill="#fff0ec"
        />
      </g>

      {/* ── 05. HERO MONOGRAM: FUSED "A" AND "G" EMBLEM ── */}
      <g>
        {/* Left Diagonal Arm of "A" */}
        <path
          d="M 256 154
             L 236 154
             L 174 316
             L 196 324
             L 230 236
             L 256 236
             Z"
          fill="url(#ag-svg-cyan)"
        />
        <path
          d="M 256 154
             L 248 154
             L 192 300
             L 204 304
             L 236 226
             L 256 226
             Z"
          fill="url(#ag-svg-cyan-dark)"
          opacity="0.45"
        />
        <path
          d="M 256 154 L 174 316 L 196 324"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.8"
        />
        <line x1="188" y1="294" x2="218" y2="216" stroke="#00e5ff" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="188" cy="294" r="2.8" fill="#5eedee" />
        <circle cx="218" cy="216" r="2.8" fill="#5eedee" />

        {/* Crossbar of "A" connecting into "G" */}
        <path
          d="M 210 248 L 272 248 L 264 266 L 220 266 Z"
          fill="url(#ag-svg-metal-light)"
        />

        {/* Luminous Ruby Core Triangle in Apex of "A" */}
        <polygon
          points="256,192 238,236 274,236"
          fill="url(#ag-svg-ruby)"
          stroke="#ff8a80"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <line x1="256" y1="192" x2="256" y2="236" stroke="#ffcdd2" strokeWidth="1" />

        {/* Top Arm of "G" */}
        <path
          d="M 270 166 L 336 182 L 336 214 L 316 214 L 316 196 L 262 182 Z"
          fill="url(#ag-svg-coral)"
        />
        <path d="M 270 166 L 336 182 L 336 214" fill="none" stroke="#fff0ec" strokeWidth="1.6" />

        {/* Inward Spur & Hook of "G" */}
        <path
          d="M 258 248 L 334 248 L 334 274 L 302 334 L 278 334 L 314 274 L 258 274 Z"
          fill="url(#ag-svg-metal-light)"
        />
        <path
          d="M 334 248 L 334 274 L 302 334 L 290 334 L 322 274 L 322 248 Z"
          fill="url(#ag-svg-metal-dark)"
        />
        <polyline
          points="258,248 334,248 334,274 302,334"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.6"
        />

        {/* Floating Right Chevron Guard */}
        <path d="M 326 214 L 344 214 L 344 240 L 326 240 Z" fill="#ff5252" opacity="0.9" />
      </g>

      {/* Central Bevel Highlight Line */}
      <line x1="256" y1="138" x2="256" y2="414" stroke="#ffffff" strokeWidth="1.2" opacity="0.35" />
    </svg>
  );
};

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
  renderMode = 'svg',
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
        {renderMode === 'svg' ? (
          <AgentGuardVectorMark
            size={dimensions.iconSize - 4}
            isScanning={isScanning}
            isAnalyzing={isAnalyzing}
          />
        ) : (
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
        )}

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
