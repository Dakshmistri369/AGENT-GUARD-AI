import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X, Sparkles, Shield, Cpu, Lock, Terminal, CheckCircle2, Zap } from 'lucide-react';

export interface LogoIntroProps {
  /** Callback fired when the intro animation finishes or is dismissed */
  onComplete?: () => void;
  /** Force the intro to run even if already played in the current session */
  forcePlay?: boolean;
  /** Total animation duration in seconds before dashboard transition (default ~4.8s) */
  durationSeconds?: number;
}

// Security Keywords orbiting the completed logo in the background
interface SecurityKeywordBadge {
  id: string;
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  x: string;
  y: string;
  textColor: string;
  borderColor: string;
  bgColor: string;
  glowColor: string;
  delayOffset: number;
  driftRangeY: number;
  driftDuration: number;
}

const SECURITY_KEYWORD_BADGES: SecurityKeywordBadge[] = [
  {
    id: 'sast',
    icon: <Zap size={14} color="#2563eb" />,
    label: 'STATIC CODE ANALYSIS (SAST)',
    sublabel: 'Deterministic Pattern Auditing',
    x: '18%',
    y: '22%',
    textColor: '#1d4ed8',
    borderColor: '#bfdbfe',
    bgColor: '#eff6ff',
    glowColor: 'rgba(37, 99, 235, 0.15)',
    delayOffset: 0.05,
    driftRangeY: -8,
    driftDuration: 3.6,
  },
  {
    id: 'scanners',
    icon: <Shield size={14} color="#059669" />,
    label: 'SEMGREP & BANDIT ENGINES',
    sublabel: 'Multi-Scanner AST Detection',
    x: '82%',
    y: '22%',
    textColor: '#15803d',
    borderColor: '#bbf7d0',
    bgColor: '#f0fdf4',
    glowColor: 'rgba(5, 150, 105, 0.15)',
    delayOffset: 0.15,
    driftRangeY: 8,
    driftDuration: 4.0,
  },
  {
    id: 'nemotron',
    icon: <Cpu size={14} color="#7c3aed" />,
    label: 'NVIDIA NEMOTRON 70B',
    sublabel: 'Deep Cybersecurity Reasoning',
    x: '14%',
    y: '45%',
    textColor: '#6d28d9',
    borderColor: '#e9d5ff',
    bgColor: '#faf5ff',
    glowColor: 'rgba(124, 58, 237, 0.18)',
    delayOffset: 0.25,
    driftRangeY: -6,
    driftDuration: 3.4,
  },
  {
    id: 'langgraph',
    icon: <Sparkles size={14} color="#4338ca" />,
    label: 'LANGGRAPH 4-AGENT PIPELINE',
    sublabel: 'Threat • Test • Evidence • Verify',
    x: '86%',
    y: '45%',
    textColor: '#3730a3',
    borderColor: '#c7d2fe',
    bgColor: '#eef2ff',
    glowColor: 'rgba(67, 56, 202, 0.18)',
    delayOffset: 0.35,
    driftRangeY: 7,
    driftDuration: 3.8,
  },
  {
    id: 'secrets',
    icon: <Lock size={14} color="#e11d48" />,
    label: 'SECRET LEAK DETECTION',
    sublabel: 'High-Entropy Token Defense',
    x: '19%',
    y: '68%',
    textColor: '#be123c',
    borderColor: '#fecaca',
    bgColor: '#fef2f2',
    glowColor: 'rgba(225, 29, 72, 0.15)',
    delayOffset: 0.45,
    driftRangeY: -7,
    driftDuration: 3.5,
  },
  {
    id: 'remediation',
    icon: <Terminal size={14} color="#0d9488" />,
    label: 'AUTOMATED CODE REMEDIATION',
    sublabel: 'Validated Unified Diff Patches',
    x: '81%',
    y: '68%',
    textColor: '#0f766e',
    borderColor: '#99f6e4',
    bgColor: '#f0fdfa',
    glowColor: 'rgba(13, 148, 136, 0.15)',
    delayOffset: 0.55,
    driftRangeY: 8,
    driftDuration: 3.9,
  },
  {
    id: 'cve-osv',
    icon: <Shield size={14} color="#0284c7" />,
    label: 'CVE & OSV VULNERABILITY AUDITING',
    sublabel: 'Supply Chain Dependency Integrity',
    x: '50%',
    y: '12%',
    textColor: '#0369a1',
    borderColor: '#bae6fd',
    bgColor: '#f0f9ff',
    glowColor: 'rgba(2, 132, 199, 0.14)',
    delayOffset: 0.2,
    driftRangeY: -5,
    driftDuration: 4.2,
  },
  {
    id: 'verification',
    icon: <CheckCircle2 size={14} color="#15803d" />,
    label: 'ZERO-DAY DEFENSE & CI VERIFICATION',
    sublabel: 'Evidence-Backed Quality Gate',
    x: '50%',
    y: '88%',
    textColor: '#166534',
    borderColor: '#bbf7d0',
    bgColor: '#f0fdf4',
    glowColor: 'rgba(22, 163, 74, 0.15)',
    delayOffset: 0.4,
    driftRangeY: 6,
    driftDuration: 3.7,
  },
];

// Large Ambient Watermark Typography across the background
interface BackgroundWatermark {
  id: string;
  text: string;
  x: string;
  y: string;
  fontSize: string;
  color: string;
  opacity: number;
  tracking: string;
}

const BACKGROUND_WATERMARKS: BackgroundWatermark[] = [
  {
    id: 'bg-guard',
    text: 'AGENTGUARD AI',
    x: '50%',
    y: '28%',
    fontSize: 'clamp(40px, 8vw, 92px)',
    color: '#0f172a',
    opacity: 0.045,
    tracking: '0.28em',
  },
  {
    id: 'bg-defense',
    text: 'CYBERSECURITY COMMAND CENTER',
    x: '50%',
    y: '74%',
    fontSize: 'clamp(22px, 4.5vw, 48px)',
    color: '#2563eb',
    opacity: 0.055,
    tracking: '0.22em',
  },
];

export const LogoIntro: React.FC<LogoIntroProps> = ({
  onComplete,
  forcePlay = false,
  durationSeconds = 4.8,
}) => {
  const shouldReduceMotion = useReducedMotion();

  const [isVisible, setIsVisible] = useState<boolean>(() => {
    if (forcePlay) return true;
    if (typeof window === 'undefined') return false;
    const seen = sessionStorage.getItem('agentguard_intro_completed');
    return seen !== 'true';
  });

  // Phases:
  // 0 = Canvas Initialization
  // 1 = Parts connect and converge from all areas
  // 2 = Circuits extend and connect nodes
  // 3 = Snap convergence & Logo completion flash
  // 4 = Wordmark & Tagline reveal
  // 5 = LOGO IS DONE -> Radial background wave & security words activate with effects
  // 6 = Smooth dissolve transition to live dashboard
  const [phase, setPhase] = useState<number>(0);

  const dismissIntro = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('agentguard_intro_completed', 'true');
    }
    setIsVisible(false);
    if (onComplete) onComplete();
  }, [onComplete]);

  // Handle reduced motion preferences gracefully
  useEffect(() => {
    if (shouldReduceMotion && isVisible) {
      const quickTimer = setTimeout(() => {
        dismissIntro();
      }, 400);
      return () => clearTimeout(quickTimer);
    }
  }, [shouldReduceMotion, isVisible, dismissIntro]);

  // Main orchestrated cinematic timeline
  useEffect(() => {
    if (!isVisible || shouldReduceMotion) return;

    // Timeline sequences:
    const tStartAssembly = setTimeout(() => setPhase(1), 80);    // 0.08s: Parts connect from all areas
    const tCircuits = setTimeout(() => setPhase(2), 650);        // 0.65s: Circuits extend & pulse
    const tCompleteSnap = setTimeout(() => setPhase(3), 1250);   // 1.25s: Parts lock & flash shockwave
    const tWordmark = setTimeout(() => setPhase(4), 1600);       // 1.60s: Wordmark & tagline reveal
    const tLogoDoneWords = setTimeout(() => setPhase(5), 2050);  // 2.05s: LOGO DONE -> Background Words activate
    const tFadeOut = setTimeout(() => setPhase(6), durationSeconds * 1000); // 4.80s: Transition
    const tFinish = setTimeout(() => {
      dismissIntro();
    }, (durationSeconds + 0.65) * 1000);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissIntro();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(tStartAssembly);
      clearTimeout(tCircuits);
      clearTimeout(tCompleteSnap);
      clearTimeout(tWordmark);
      clearTimeout(tLogoDoneWords);
      clearTimeout(tFadeOut);
      clearTimeout(tFinish);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isVisible, shouldReduceMotion, durationSeconds, dismissIntro]);

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      {phase < 7 && (
        <motion.div
          key="agentguard-cinematic-intro"
          initial={{ opacity: 1 }}
          animate={phase === 6 ? { opacity: 0, scale: 1.025 } : { opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.03 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            pointerEvents: phase === 6 ? 'none' : 'auto',
          }}
          role="dialog"
          aria-label="AgentGuard AI Animated Logo Intro"
        >
          {/* Subtle Cyber Grid Background Matrix */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `
                linear-gradient(to right, rgba(226, 232, 240, 0.45) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(226, 232, 240, 0.45) 1px, transparent 1px)
              `,
              backgroundSize: '48px 48px',
              maskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 80%)',
              WebkitMaskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 80%)',
              pointerEvents: 'none',
              opacity: phase >= 1 ? 0.8 : 0,
              transition: 'opacity 0.8s ease',
            }}
          />

          {/* Center Radial Glow Aura */}
          <motion.div
            animate={{
              scale: phase >= 3 ? [1, 1.15, 1] : 1,
              opacity: phase >= 3 ? [0.4, 0.85, 0.6] : 0.25,
            }}
            transition={{ duration: 2.2, repeat: Infinity, repeatType: 'reverse' }}
            style={{
              position: 'absolute',
              width: '750px',
              height: '750px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(99, 102, 241, 0.08) 0%, rgba(6, 182, 212, 0.04) 40%, rgba(255, 255, 255, 0) 70%)',
              pointerEvents: 'none',
              transform: 'translate(-50%, -50%)',
              left: '50%',
              top: '50%',
            }}
          />

          {/* ── SKIP BUTTON ── */}
          <motion.button
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 0.85, y: 0 }}
            whileHover={{ opacity: 1, scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            transition={{ delay: 0.4, duration: 0.3 }}
            onClick={dismissIntro}
            style={{
              position: 'absolute',
              top: '24px',
              right: '28px',
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '999px',
              background: 'rgba(255, 255, 255, 0.9)',
              border: '1px solid #cbd5e1',
              color: '#334155',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
            title="Skip introduction (Esc)"
            aria-label="Skip introduction"
          >
            <span>Skip</span>
            <span style={{ fontSize: '10px', color: '#64748b', background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>Esc</span>
            <X size={13} style={{ marginLeft: '2px' }} />
          </motion.button>

          {/* ═══════════════════════════════════════════════════════════════
              PHASE 5: BACKGROUND SECURITY WORDS & EFFECTS (TRIGGERED ONCE LOGO IS DONE)
              ═══════════════════════════════════════════════════════════════ */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-hidden="true"
          >
            {/* 1. Large Ambient Architectural Watermarks */}
            {BACKGROUND_WATERMARKS.map((wm) => {
              const shouldShow = phase >= 5;
              return (
                <motion.div
                  key={wm.id}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={
                    shouldShow
                      ? { opacity: wm.opacity, scale: 1 }
                      : { opacity: 0, scale: 0.94 }
                  }
                  transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    position: 'absolute',
                    left: wm.x,
                    top: wm.y,
                    transform: 'translate(-50%, -50%)',
                    fontSize: wm.fontSize,
                    fontWeight: 900,
                    color: wm.color,
                    letterSpacing: wm.tracking,
                    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                    zIndex: 2,
                  }}
                >
                  {wm.text}
                </motion.div>
              );
            })}

            {/* 2. Concentric Radial Wave Emission when Logo Finishes */}
            {phase >= 5 && (
              <motion.div
                initial={{ scale: 0.2, opacity: 0.9 }}
                animate={{ scale: 2.5, opacity: 0 }}
                transition={{ duration: 1.4, ease: 'easeOut' }}
                style={{
                  position: 'absolute',
                  width: '380px',
                  height: '380px',
                  borderRadius: '50%',
                  border: '2px solid rgba(37, 99, 235, 0.4)',
                  boxShadow: '0 0 30px rgba(6, 182, 212, 0.25)',
                  pointerEvents: 'none',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 3,
                }}
              />
            )}

            {/* 3. Orbiting Security Tech Badges with Floating Kinetic Effects */}
            {SECURITY_KEYWORD_BADGES.map((badge) => {
              const shouldShow = phase >= 5;
              return (
                <motion.div
                  key={badge.id}
                  initial={{
                    opacity: 0,
                    scale: 0.65,
                    y: 20,
                  }}
                  animate={
                    shouldShow
                      ? {
                          opacity: 1,
                          scale: 1,
                          y: [0, badge.driftRangeY, 0],
                        }
                      : { opacity: 0, scale: 0.65, y: 20 }
                  }
                  transition={
                    shouldShow
                      ? {
                          opacity: { duration: 0.6, delay: badge.delayOffset, ease: [0.16, 1, 0.3, 1] },
                          scale: { duration: 0.6, delay: badge.delayOffset, ease: [0.16, 1, 0.3, 1] },
                          y: {
                            duration: badge.driftDuration,
                            repeat: Infinity,
                            repeatType: 'reverse',
                            ease: 'easeInOut',
                            delay: badge.delayOffset + 0.6,
                          },
                        }
                      : { duration: 0.2 }
                  }
                  style={{
                    position: 'absolute',
                    left: badge.x,
                    top: badge.y,
                    transform: 'translate(-50%, -50%)',
                    zIndex: 6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 14px',
                    borderRadius: '10px',
                    background: badge.bgColor,
                    border: `1px solid ${badge.borderColor}`,
                    boxShadow: `0 4px 18px ${badge.glowColor}, 0 1px 3px rgba(0,0,0,0.04)`,
                    backdropFilter: 'blur(8px)',
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                  }}
                >
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '6px',
                      background: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                      flexShrink: 0,
                    }}
                  >
                    {badge.icon}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span
                      style={{
                        fontSize: '11.5px',
                        fontWeight: 700,
                        color: badge.textColor,
                        letterSpacing: '0.04em',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        lineHeight: 1.2,
                      }}
                    >
                      {badge.label}
                    </span>
                    <span
                      style={{
                        fontSize: '9.5px',
                        color: '#64748b',
                        fontWeight: 500,
                        fontFamily: 'Inter, system-ui, sans-serif',
                      }}
                    >
                      {badge.sublabel}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              FOREGROUND: LOGO PARTS CONNECT FROM ALL AREAS & COMPLETE LOGO
              ═══════════════════════════════════════════════════════════════ */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              maxWidth: '92vw',
              position: 'relative',
            }}
          >
            {/* SVG Shield & Mark Container */}
            <div
              style={{
                width: 'clamp(145px, 22vw, 195px)',
                height: 'clamp(155px, 23.5vw, 210px)',
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
                  {/* Energy Circuit Gradients */}
                  <linearGradient id="circuit-flow-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#06b6d4" />
                    <stop offset="50%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#7c3aed" />
                  </linearGradient>

                  {/* Terminal Glow Filter */}
                  <filter id="node-glow" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {/* ── PART 1: LEFT SHIELD PERIMETER (Flies in from Top-Left quadrant) ── */}
                <motion.path
                  d="M 88 8 L 14 29 L 14 116 C 14 158, 48 188, 88 206"
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="9.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ x: -90, y: -45, rotate: -12, opacity: 0, pathLength: 0 }}
                  animate={
                    phase >= 1
                      ? { x: 0, y: 0, rotate: 0, opacity: 1, pathLength: 1 }
                      : { x: -90, y: -45, rotate: -12, opacity: 0, pathLength: 0 }
                  }
                  transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                />

                {/* ── PART 2: RIGHT UPPER SHIELD (Flies in from Top-Right quadrant) ── */}
                <motion.path
                  d="M 88 8 L 132 21 M 145 25 L 164 30 L 164 68"
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="9.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ x: 90, y: -40, rotate: 12, opacity: 0, pathLength: 0 }}
                  animate={
                    phase >= 1
                      ? { x: 0, y: 0, rotate: 0, opacity: 1, pathLength: 1 }
                      : { x: 90, y: -40, rotate: 12, opacity: 0, pathLength: 0 }
                  }
                  transition={{ duration: 0.85, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
                />

                {/* ── PART 3: RIGHT LOWER SHIELD (Flies in from Bottom-Right quadrant) ── */}
                <motion.path
                  d="M 164 104 C 164 135, 148 168, 88 206"
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="9.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ x: 80, y: 60, rotate: 8, opacity: 0, pathLength: 0 }}
                  animate={
                    phase >= 1
                      ? { x: 0, y: 0, rotate: 0, opacity: 1, pathLength: 1 }
                      : { x: 80, y: 60, rotate: 8, opacity: 0, pathLength: 0 }
                  }
                  transition={{ duration: 0.8, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
                />

                {/* ── PART 4: CENTRAL 'A' — BOLD RIGHT DIAGONAL LEG (Descends from Above) ── */}
                <motion.path
                  d="M 88 38 L 142 142"
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="13"
                  strokeLinecap="round"
                  initial={{ y: -75, x: 25, scaleY: 0.25, opacity: 0 }}
                  animate={
                    phase >= 1
                      ? { y: 0, x: 0, scaleY: 1, opacity: 1 }
                      : { y: -75, x: 25, scaleY: 0.25, opacity: 0 }
                  }
                  transition={{ duration: 0.75, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
                />

                {/* ── PART 5: CENTRAL 'A' — LEFT UPPER SEGMENT (Descends from Above-Left) ── */}
                <motion.path
                  d="M 88 38 L 65 78"
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="12"
                  strokeLinecap="round"
                  initial={{ x: -45, y: -35, opacity: 0 }}
                  animate={
                    phase >= 1
                      ? { x: 0, y: 0, opacity: 1 }
                      : { x: -45, y: -35, opacity: 0 }
                  }
                  transition={{ duration: 0.65, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
                />

                {/* ── PART 6: CENTRAL 'A' — LEFT LOWER DUAL SLASHES (Glides from Left) ── */}
                <motion.path
                  d="M 54 98 L 34 140"
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="8"
                  strokeLinecap="round"
                  initial={{ x: -55, opacity: 0 }}
                  animate={
                    phase >= 1
                      ? { x: 0, opacity: 1 }
                      : { x: -55, opacity: 0 }
                  }
                  transition={{ duration: 0.55, delay: 0.34, ease: [0.16, 1, 0.3, 1] }}
                />
                <motion.path
                  d="M 68 98 L 48 140"
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="6"
                  strokeLinecap="round"
                  initial={{ x: -55, opacity: 0 }}
                  animate={
                    phase >= 1
                      ? { x: 0, opacity: 1 }
                      : { x: -55, opacity: 0 }
                  }
                  transition={{ duration: 0.55, delay: 0.38, ease: [0.16, 1, 0.3, 1] }}
                />

                {/* ── PART 7: CIRCUITS CONNECTING ALL AREAS TO CORE (Shoots from Core outwards) ── */}
                {/* Circuit A: Top-Right Lightning Branch */}
                <motion.path
                  d="M 96 44 L 110 44 L 118 34 L 136 30 L 142 15"
                  fill="none"
                  stroke={phase === 2 ? 'url(#circuit-flow-gradient)' : '#0f172a'}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={phase >= 2 ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                  transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
                />

                {/* Circuit B: Middle-Right Arm */}
                <motion.path
                  d="M 134 94 L 155 88 L 172 80 L 186 62"
                  fill="none"
                  stroke={phase === 2 ? 'url(#circuit-flow-gradient)' : '#0f172a'}
                  strokeWidth="5.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={phase >= 2 ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                  transition={{ duration: 0.55, delay: 0.18, ease: 'easeOut' }}
                />

                {/* Circuit C: Bottom-Left Arm */}
                <motion.path
                  d="M 44 126 L 30 133 L 20 133 L 12 133"
                  fill="none"
                  stroke={phase === 2 ? 'url(#circuit-flow-gradient)' : '#0f172a'}
                  strokeWidth="5.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={phase >= 2 ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                  transition={{ duration: 0.5, delay: 0.26, ease: 'easeOut' }}
                />

                {/* Circuit D: Internal Spine Track */}
                <motion.path
                  d="M 85 185 L 85 160 L 87 128 L 108 112"
                  fill="none"
                  stroke={phase === 2 ? 'url(#circuit-flow-gradient)' : '#0f172a'}
                  strokeWidth="5.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={phase >= 2 ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                  transition={{ duration: 0.55, delay: 0.32, ease: 'easeOut' }}
                />

                {/* ── PART 8: CONNECTION NODES (Illuminates in sequence with cyber pulses) ── */}
                {/* Node 1: Far-Right External Terminal (186, 62) */}
                <motion.circle
                  cx="186"
                  cy="62"
                  r="7"
                  fill="#ffffff"
                  stroke={phase === 2 ? '#06b6d4' : phase >= 3 ? '#0f172a' : '#0f172a'}
                  strokeWidth="4.5"
                  filter={phase === 2 ? 'url(#node-glow)' : 'none'}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={
                    phase >= 2
                      ? {
                          scale: phase === 2 ? [0, 1.5, 1] : 1,
                          opacity: 1,
                        }
                      : { scale: 0, opacity: 0 }
                  }
                  transition={{ duration: 0.4, delay: 0.2 }}
                />
                <motion.circle
                  cx="186"
                  cy="62"
                  r="2.5"
                  fill={phase === 2 ? '#06b6d4' : '#0f172a'}
                  initial={{ scale: 0 }}
                  animate={phase >= 2 ? { scale: 1 } : { scale: 0 }}
                />

                {/* Node 2: Crossbar Hub (150, 94) */}
                <motion.circle
                  cx="150"
                  cy="94"
                  r="5.5"
                  fill="#ffffff"
                  stroke={phase === 2 ? '#3b82f6' : '#0f172a'}
                  strokeWidth="3.5"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={
                    phase >= 2
                      ? {
                          scale: phase === 2 ? [0, 1.4, 1] : 1,
                          opacity: 1,
                        }
                      : { scale: 0, opacity: 0 }
                  }
                  transition={{ duration: 0.35, delay: 0.25 }}
                />

                {/* Node 3: Spine Junction Hub (87, 128) */}
                <motion.circle
                  cx="87"
                  cy="128"
                  r="5.5"
                  fill="#ffffff"
                  stroke={phase === 2 ? '#7c3aed' : '#0f172a'}
                  strokeWidth="3.5"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={
                    phase >= 2
                      ? {
                          scale: phase === 2 ? [0, 1.4, 1] : 1,
                          opacity: 1,
                        }
                      : { scale: 0, opacity: 0 }
                  }
                  transition={{ duration: 0.35, delay: 0.3 }}
                />

                {/* Node 4: Far-Left Terminal (12, 133) */}
                <motion.circle
                  cx="12"
                  cy="133"
                  r="7"
                  fill="#ffffff"
                  stroke={phase === 2 ? '#06b6d4' : '#0f172a'}
                  strokeWidth="4.5"
                  filter={phase === 2 ? 'url(#node-glow)' : 'none'}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={
                    phase >= 2
                      ? {
                          scale: phase === 2 ? [0, 1.5, 1] : 1,
                          opacity: 1,
                        }
                      : { scale: 0, opacity: 0 }
                  }
                  transition={{ duration: 0.4, delay: 0.35 }}
                />
                <motion.circle
                  cx="12"
                  cy="133"
                  r="2.5"
                  fill={phase === 2 ? '#06b6d4' : '#0f172a'}
                  initial={{ scale: 0 }}
                  animate={phase >= 2 ? { scale: 1 } : { scale: 0 }}
                />

                {/* Node 5: Lower Spine Hub (85, 160) */}
                <motion.circle
                  cx="85"
                  cy="160"
                  r="5.5"
                  fill="#ffffff"
                  stroke={phase === 2 ? '#7c3aed' : '#0f172a'}
                  strokeWidth="3.5"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={
                    phase >= 2
                      ? {
                          scale: phase === 2 ? [0, 1.4, 1] : 1,
                          opacity: 1,
                        }
                      : { scale: 0, opacity: 0 }
                  }
                  transition={{ duration: 0.35, delay: 0.4 }}
                />

                {/* ── PART 9: COMPLETION FLASH & CONVERGENCE SHOCKWAVE (Phase 3) ── */}
                {phase >= 3 && (
                  <>
                    {/* Apex Convergence Flash */}
                    <motion.circle
                      cx="88"
                      cy="8"
                      r="9"
                      fill="#3b82f6"
                      initial={{ scale: 0.4, opacity: 0.9 }}
                      animate={{ scale: 2.2, opacity: 0 }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                    {/* Bottom Tip Convergence Flash */}
                    <motion.circle
                      cx="88"
                      cy="206"
                      r="12"
                      fill="#06b6d4"
                      initial={{ scale: 0.5, opacity: 0.95 }}
                      animate={{ scale: 2.6, opacity: 0 }}
                      transition={{ duration: 0.55, ease: 'easeOut' }}
                    />
                  </>
                )}
              </svg>
            </div>

            {/* ── PHASE 4: AGENTGUARD AI WORDMARK & TAGLINE ── */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginTop: '18px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '8px',
                  lineHeight: 1.1,
                }}
              >
                {/* "AgentGuard" — Black Bold Modern Wordmark */}
                <motion.span
                  initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
                  animate={
                    phase >= 4
                      ? { opacity: 1, y: 0, filter: 'blur(0px)' }
                      : { opacity: 0, y: 12, filter: 'blur(6px)' }
                  }
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    fontSize: 'clamp(30px, 4.6vw, 48px)',
                    fontWeight: 800,
                    color: '#0f172a',
                    letterSpacing: '-0.035em',
                    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                  }}
                >
                  AgentGuard
                </motion.span>

                {/* "AI" — Purple Gradient Lettering */}
                <motion.span
                  initial={{ opacity: 0, scale: 0.75, filter: 'blur(6px)' }}
                  animate={
                    phase >= 4
                      ? { opacity: 1, scale: 1, filter: 'blur(0px)' }
                      : { opacity: 0, scale: 0.75, filter: 'blur(6px)' }
                  }
                  transition={{ duration: 0.55, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    fontSize: 'clamp(30px, 4.6vw, 48px)',
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
                initial={{ opacity: 0, y: 8 }}
                animate={
                  phase >= 4
                    ? { opacity: 1, y: 0 }
                    : { opacity: 0, y: 8 }
                }
                transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginTop: '8px',
                }}
              >
                <span
                  style={{
                    fontSize: 'clamp(11px, 1.4vw, 13.5px)',
                    fontWeight: 700,
                    color: '#475569',
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    fontFamily: 'JetBrains Mono, monospace',
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
