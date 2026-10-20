import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';

export interface LogoIntroProps {
  /** Callback fired when the intro animation finishes or is skipped */
  onComplete?: () => void;
  /** Force the intro to run even if already played in the current session */
  forcePlay?: boolean;
  /** Total animation duration before initiating fade-out in seconds (default ~3.6s) */
  durationSeconds?: number;
}

// Background security vocabulary words configuration
interface BackgroundWord {
  id: string;
  text: string;
  x: string;
  y: string;
  fontSize: string;
  fontWeight: number;
  color: string;
  initialX?: number;
  initialY?: number;
  initialBlur?: string;
  delay: number;
  targetOpacity: number;
  tracking?: string;
}

const BACKGROUND_WORDS: BackgroundWord[] = [
  {
    id: 'w-secure-code',
    text: 'SECURE CODE',
    x: '50%',
    y: '18%',
    fontSize: 'clamp(32px, 6vw, 68px)',
    fontWeight: 900,
    color: '#0f172a',
    initialY: -20,
    delay: 2.1,
    targetOpacity: 0.06,
    tracking: '0.22em',
  },
  {
    id: 'w-ai-security',
    text: 'AI SECURITY',
    x: '50%',
    y: '82%',
    fontSize: 'clamp(28px, 5.5vw, 60px)',
    fontWeight: 900,
    color: '#7c3aed',
    initialY: 20,
    delay: 2.25,
    targetOpacity: 0.07,
    tracking: '0.24em',
  },
  {
    id: 'w-scan',
    text: 'SCAN',
    x: '18%',
    y: '28%',
    fontSize: 'clamp(20px, 3.5vw, 42px)',
    fontWeight: 800,
    color: '#0284c7',
    initialX: -50,
    delay: 2.2,
    targetOpacity: 0.18,
    tracking: '0.12em',
  },
  {
    id: 'w-analyze',
    text: 'ANALYZE',
    x: '82%',
    y: '28%',
    fontSize: 'clamp(20px, 3.5vw, 42px)',
    fontWeight: 800,
    color: '#7c3aed',
    initialX: 50,
    delay: 2.35,
    targetOpacity: 0.2,
    tracking: '0.12em',
  },
  {
    id: 'w-detect',
    text: 'DETECT',
    x: '15%',
    y: '50%',
    fontSize: 'clamp(22px, 3.8vw, 44px)',
    fontWeight: 800,
    color: '#0f172a',
    initialX: -40,
    delay: 2.45,
    targetOpacity: 0.16,
    tracking: '0.1em',
  },
  {
    id: 'w-protect',
    text: 'PROTECT',
    x: '85%',
    y: '50%',
    fontSize: 'clamp(22px, 3.8vw, 44px)',
    fontWeight: 800,
    color: '#4f46e5',
    initialX: 40,
    delay: 2.55,
    targetOpacity: 0.18,
    tracking: '0.1em',
  },
  {
    id: 'w-explain',
    text: 'EXPLAIN',
    x: '22%',
    y: '70%',
    fontSize: 'clamp(18px, 3vw, 36px)',
    fontWeight: 800,
    color: '#8b5cf6',
    initialY: 30,
    delay: 2.65,
    targetOpacity: 0.16,
    tracking: '0.12em',
  },
  {
    id: 'w-fix',
    text: 'FIX',
    x: '78%',
    y: '70%',
    fontSize: 'clamp(20px, 3.2vw, 38px)',
    fontWeight: 800,
    color: '#059669',
    initialY: 30,
    delay: 2.75,
    targetOpacity: 0.18,
    tracking: '0.14em',
  },
];

export const LogoIntro: React.FC<LogoIntroProps> = ({
  onComplete,
  forcePlay = false,
  durationSeconds = 3.8,
}) => {
  const shouldReduceMotion = useReducedMotion();

  // Check session storage so intro runs once per session unless forcePlay is set
  const [isVisible, setIsVisible] = useState<boolean>(() => {
    if (forcePlay) return true;
    if (typeof window === 'undefined') return false;
    const seen = sessionStorage.getItem('agentguard_intro_completed');
    return seen !== 'true';
  });

  // Track phase of cinematic sequence (0 to 7)
  const [phase, setPhase] = useState<number>(0);

  const dismissIntro = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('agentguard_intro_completed', 'true');
    }
    setIsVisible(false);
    if (onComplete) onComplete();
  }, [onComplete]);

  // If reduced motion is preferred, complete quickly and cleanly
  useEffect(() => {
    if (shouldReduceMotion && isVisible) {
      const quickTimer = setTimeout(() => {
        dismissIntro();
      }, 400);
      return () => clearTimeout(quickTimer);
    }
  }, [shouldReduceMotion, isVisible, dismissIntro]);

  // Main cinematic timeline coordinator
  useEffect(() => {
    if (!isVisible || shouldReduceMotion) return;

    // Timeline markers (in ms)
    const tAwakening = setTimeout(() => setPhase(1), 50);     // Phase 1: 0.05s
    const tCircuits = setTimeout(() => setPhase(2), 400);     // Phase 2: 0.40s
    const tShield = setTimeout(() => setPhase(3), 900);       // Phase 3: 0.90s
    const tPulse = setTimeout(() => setPhase(4), 1500);       // Phase 4: 1.50s
    const tWordmark = setTimeout(() => setPhase(5), 1800);    // Phase 5: 1.80s
    const tWords = setTimeout(() => setPhase(6), 2200);       // Phase 6: 2.20s
    const tFadeOut = setTimeout(() => setPhase(7), durationSeconds * 1000); // Phase 7: ~3.8s
    const tComplete = setTimeout(() => {
      dismissIntro();
    }, (durationSeconds + 0.65) * 1000);

    // Keyboard 'Escape' to skip immediately
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dismissIntro();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(tAwakening);
      clearTimeout(tCircuits);
      clearTimeout(tShield);
      clearTimeout(tPulse);
      clearTimeout(tWordmark);
      clearTimeout(tWords);
      clearTimeout(tFadeOut);
      clearTimeout(tComplete);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isVisible, shouldReduceMotion, durationSeconds, dismissIntro]);

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      {phase < 8 && (
        <motion.div
          key="agentguard-intro-overlay"
          initial={{ opacity: 1 }}
          animate={phase === 7 ? { opacity: 0, scale: 0.985 } : { opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            pointerEvents: phase === 7 ? 'none' : 'auto',
          }}
          role="dialog"
          aria-label="AgentGuard AI Startup Introduction"
        >
          {/* Subtle Ambient Radial Glow (Cyan to Violet) */}
          <div
            style={{
              position: 'absolute',
              width: '800px',
              height: '800px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(99, 102, 241, 0.04) 0%, rgba(6, 182, 212, 0.02) 40%, rgba(255, 255, 255, 0) 70%)',
              pointerEvents: 'none',
              transform: 'translate(-50%, -50%)',
              left: '50%',
              top: '50%',
            }}
          />

          {/* ── SKIP BUTTON (Accessible & Unobtrusive) ── */}
          <motion.button
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 0.85, y: 0 }}
            whileHover={{ opacity: 1, scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            transition={{ delay: 0.6, duration: 0.3 }}
            onClick={dismissIntro}
            style={{
              position: 'absolute',
              top: '24px',
              right: '24px',
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '999px',
              background: 'rgba(241, 245, 249, 0.85)',
              border: '1px solid #e2e8f0',
              color: '#475569',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}
            title="Skip startup intro (Esc)"
            aria-label="Skip introduction"
          >
            <span>Skip</span>
            <span style={{ fontSize: '10px', color: '#94a3b8', background: '#ffffff', padding: '1px 5px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>Esc</span>
            <X size={12} style={{ marginLeft: '2px' }} />
          </motion.button>

          {/* ── PHASE 6: BACKGROUND SECURITY WORDS LAYER ── */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              overflow: 'hidden',
            }}
            aria-hidden="true"
          >
            {BACKGROUND_WORDS.map((word) => {
              const shouldShow = phase >= 6;
              return (
                <motion.div
                  key={word.id}
                  initial={{
                    opacity: 0,
                    x: word.initialX ? word.initialX : 0,
                    y: word.initialY ? word.initialY : 0,
                    filter: 'blur(6px)',
                  }}
                  animate={
                    shouldShow
                      ? {
                          opacity: word.targetOpacity,
                          x: 0,
                          y: 0,
                          filter: 'blur(0px)',
                        }
                      : { opacity: 0 }
                  }
                  transition={{
                    duration: 0.75,
                    delay: word.delay - 2.0, // relative to Phase 6 entrance
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  style={{
                    position: 'absolute',
                    left: word.x,
                    top: word.y,
                    transform: 'translate(-50%, -50%)',
                    fontSize: word.fontSize,
                    fontWeight: word.fontWeight,
                    color: word.color,
                    letterSpacing: word.tracking || '0.1em',
                    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                  }}
                >
                  {word.text}
                </motion.div>
              );
            })}
          </div>

          {/* ── FOREGROUND: ASSEMBLED AGENTGUARD AI LOGO & WORDMARK ── */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              maxWidth: '92vw',
            }}
          >
            {/* SVG Logo Mark Container */}
            <div
              style={{
                width: 'clamp(140px, 22vw, 190px)',
                height: 'clamp(150px, 23.5vw, 204px)',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
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
                  {/* Cyan Wave Gradient for Circuit Pulse */}
                  <linearGradient id="intro-circuit-pulse" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.1" />
                    <stop offset="50%" stopColor="#06b6d4" stopOpacity="1" />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.2" />
                  </linearGradient>

                  {/* Terminal Glow Filter */}
                  <filter id="intro-glow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="3.5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {/* ── PHASE 3: SHIELD ASSEMBLY OUTLINE (Black Geometric Strokes) ── */}
                {/* Left Shield Perimeter */}
                <motion.path
                  d="M 88 8 L 14 29 L 14 116 C 14 158, 48 188, 88 206"
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="9.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={phase >= 3 ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                  transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                />

                {/* Right Upper Shield Perimeter */}
                <motion.path
                  d="M 88 8 L 132 21 M 145 25 L 164 30 L 164 68"
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="9.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={phase >= 3 ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                  transition={{ duration: 0.65, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
                />

                {/* Right Lower Shield Perimeter */}
                <motion.path
                  d="M 164 104 C 164 135, 148 168, 88 206"
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="9.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={phase >= 3 ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                  transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
                />

                {/* ── PHASE 3 & 4: CENTRAL STYLIZED 'A' ── */}
                {/* Right Leg (Bold Solid Stroke) */}
                <motion.path
                  d="M 88 38 L 142 142"
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="13"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={phase >= 3 ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                  transition={{ duration: 0.55, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
                />

                {/* Left Leg Upper Segment */}
                <motion.path
                  d="M 88 38 L 65 78"
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="12"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={phase >= 3 ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                  transition={{ duration: 0.45, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
                />

                {/* Left Leg Lower Parallel Bars */}
                <motion.path
                  d="M 54 98 L 34 140"
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="8"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={phase >= 3 ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                  transition={{ duration: 0.4, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
                />
                <motion.path
                  d="M 68 98 L 48 140"
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="6"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={phase >= 3 ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                  transition={{ duration: 0.4, delay: 0.38, ease: [0.16, 1, 0.3, 1] }}
                />

                {/* ── PHASE 2: CONNECTING THE CIRCUITS ── */}
                {/* Top-Right Lightning Trace */}
                <motion.path
                  d="M 96 44 L 110 44 L 118 34 L 136 30 L 142 15"
                  fill="none"
                  stroke={phase === 4 ? '#06b6d4' : '#0f172a'}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={phase >= 2 ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                  transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
                />

                {/* Right Circuit Arm */}
                <motion.path
                  d="M 134 94 L 155 88 L 172 80 L 186 62"
                  fill="none"
                  stroke={phase === 4 ? '#06b6d4' : '#0f172a'}
                  strokeWidth="5.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={phase >= 2 ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                  transition={{ duration: 0.55, delay: 0.2, ease: 'easeOut' }}
                />

                {/* Bottom-Left Circuit Arm */}
                <motion.path
                  d="M 44 126 L 30 133 L 20 133 L 12 133"
                  fill="none"
                  stroke={phase === 4 ? '#06b6d4' : '#0f172a'}
                  strokeWidth="5.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={phase >= 2 ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                  transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
                />

                {/* Internal Spine & Crossbar Track */}
                <motion.path
                  d="M 85 185 L 85 160 L 87 128 L 108 112"
                  fill="none"
                  stroke={phase === 4 ? '#06b6d4' : '#0f172a'}
                  strokeWidth="5.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={phase >= 2 ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                  transition={{ duration: 0.55, delay: 0.35, ease: 'easeOut' }}
                />

                {/* ── PHASE 1 & 4: CIRCUIT NODES (Awakening & Sequential Pulse) ── */}
                {/* Node 1: Far Right External Terminal */}
                <motion.circle
                  cx="186"
                  cy="62"
                  r="7"
                  fill="#ffffff"
                  stroke={phase === 1 ? '#06b6d4' : phase === 4 ? '#8b5cf6' : '#0f172a'}
                  strokeWidth="4.5"
                  filter={phase === 1 || phase === 4 ? 'url(#intro-glow)' : 'none'}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={
                    phase >= 1
                      ? {
                          scale: phase === 1 ? [0, 1.4, 1] : phase === 4 ? [1, 1.35, 1] : 1,
                          opacity: 1,
                        }
                      : { scale: 0, opacity: 0 }
                  }
                  transition={{ duration: 0.4, ease: 'backOut' }}
                />
                <motion.circle
                  cx="186"
                  cy="62"
                  r="2.5"
                  fill={phase === 1 ? '#06b6d4' : phase === 4 ? '#8b5cf6' : '#0f172a'}
                  initial={{ scale: 0 }}
                  animate={phase >= 1 ? { scale: 1 } : { scale: 0 }}
                />

                {/* Node 2: Crossbar Connection Node */}
                <motion.circle
                  cx="150"
                  cy="94"
                  r="5.5"
                  fill="#ffffff"
                  stroke={phase === 4 ? '#06b6d4' : '#0f172a'}
                  strokeWidth="3.5"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={
                    phase >= 2
                      ? {
                          scale: phase === 4 ? [1, 1.3, 1] : 1,
                          opacity: 1,
                        }
                      : { scale: 0, opacity: 0 }
                  }
                  transition={{ duration: 0.35, delay: 0.2 }}
                />

                {/* Node 3: Spine Upper Node */}
                <motion.circle
                  cx="87"
                  cy="128"
                  r="5.5"
                  fill="#ffffff"
                  stroke={phase === 4 ? '#06b6d4' : '#0f172a'}
                  strokeWidth="3.5"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={
                    phase >= 2
                      ? {
                          scale: phase === 4 ? [1, 1.3, 1] : 1,
                          opacity: 1,
                        }
                      : { scale: 0, opacity: 0 }
                  }
                  transition={{ duration: 0.35, delay: 0.3 }}
                />

                {/* Node 4: Far Left External Terminal */}
                <motion.circle
                  cx="12"
                  cy="133"
                  r="7"
                  fill="#ffffff"
                  stroke={phase === 1 ? '#06b6d4' : phase === 4 ? '#06b6d4' : '#0f172a'}
                  strokeWidth="4.5"
                  filter={phase === 1 || phase === 4 ? 'url(#intro-glow)' : 'none'}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={
                    phase >= 1
                      ? {
                          scale: phase === 1 ? [0, 1.4, 1] : phase === 4 ? [1, 1.35, 1] : 1,
                          opacity: 1,
                        }
                      : { scale: 0, opacity: 0 }
                  }
                  transition={{ duration: 0.4, delay: 0.15, ease: 'backOut' }}
                />
                <motion.circle
                  cx="12"
                  cy="133"
                  r="2.5"
                  fill={phase === 1 ? '#06b6d4' : phase === 4 ? '#06b6d4' : '#0f172a'}
                  initial={{ scale: 0 }}
                  animate={phase >= 1 ? { scale: 1 } : { scale: 0 }}
                />

                {/* Node 5: Lower Spine Node */}
                <motion.circle
                  cx="85"
                  cy="160"
                  r="5.5"
                  fill="#ffffff"
                  stroke={phase === 1 ? '#8b5cf6' : phase === 4 ? '#8b5cf6' : '#0f172a'}
                  strokeWidth="3.5"
                  filter={phase === 1 ? 'url(#intro-glow)' : 'none'}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={
                    phase >= 1
                      ? {
                          scale: phase === 1 ? [0, 1.3, 1] : phase === 4 ? [1, 1.3, 1] : 1,
                          opacity: 1,
                        }
                      : { scale: 0, opacity: 0 }
                  }
                  transition={{ duration: 0.35, delay: 0.25 }}
                />

                {/* Momentary Outline Completion Flash (Phase 3 -> 4) */}
                {phase === 3 && (
                  <motion.circle
                    cx="88"
                    cy="206"
                    r="12"
                    fill="#06b6d4"
                    initial={{ scale: 0.5, opacity: 0.8 }}
                    animate={{ scale: 2.2, opacity: 0 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                )}
              </svg>
            </div>

            {/* ── PHASE 5: AGENTGUARD AI WORDMARK & TAGLINE ── */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginTop: '18px',
                textAlign: 'center',
              }}
            >
              {/* Main Title Row: AgentGuard + Purple AI */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '8px',
                  lineHeight: 1.1,
                }}
              >
                {/* "AgentGuard" — Black Bold Sans-Serif */}
                <motion.span
                  initial={{ opacity: 0, x: -16, filter: 'blur(4px)' }}
                  animate={
                    phase >= 5
                      ? { opacity: 1, x: 0, filter: 'blur(0px)' }
                      : { opacity: 0, x: -16, filter: 'blur(4px)' }
                  }
                  transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    fontSize: 'clamp(28px, 4.5vw, 46px)',
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
                  initial={{ opacity: 0, scale: 0.8, filter: 'blur(4px)' }}
                  animate={
                    phase >= 5
                      ? { opacity: 1, scale: 1, filter: 'blur(0px)' }
                      : { opacity: 0, scale: 0.8, filter: 'blur(4px)' }
                  }
                  transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    fontSize: 'clamp(28px, 4.5vw, 46px)',
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    background: 'linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    display: 'inline-block',
                    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                  }}
                >
                  AI
                </motion.span>
              </div>

              {/* Tagline: "AI POWERED CODE SECURITY" */}
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={
                  phase >= 5
                    ? { opacity: 1, y: 0 }
                    : { opacity: 0, y: 6 }
                }
                transition={{ duration: 0.5, delay: 0.4, ease: 'easeOut' }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginTop: '8px',
                }}
              >
                <span
                  style={{
                    fontSize: 'clamp(10px, 1.4vw, 13px)',
                    fontWeight: 700,
                    color: '#64748b',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  }}
                >
                  AI POWERED CODE SECURITY
                </span>
              </motion.div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
