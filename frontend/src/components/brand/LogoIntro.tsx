import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X, Sparkles, Shield, Cpu, Lock, Terminal, CheckCircle2, Zap } from 'lucide-react';
import { AgentGuardVectorMark } from './AnimatedBrandLogo';

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
    icon: <Zap size={14} color="#00f0ff" />,
    label: 'STATIC CODE ANALYSIS (SAST)',
    sublabel: 'Deterministic Pattern Auditing',
    x: '18%',
    y: '22%',
    textColor: '#00f0ff',
    borderColor: 'rgba(0, 240, 255, 0.35)',
    bgColor: 'rgba(10, 18, 32, 0.92)',
    glowColor: 'rgba(0, 240, 255, 0.25)',
    delayOffset: 0.05,
    driftRangeY: -8,
    driftDuration: 3.6,
  },
  {
    id: 'scanners',
    icon: <Shield size={14} color="#10b981" />,
    label: 'SEMGREP & BANDIT ENGINES',
    sublabel: 'Multi-Scanner AST Detection',
    x: '82%',
    y: '22%',
    textColor: '#34d399',
    borderColor: 'rgba(16, 185, 129, 0.35)',
    bgColor: 'rgba(10, 18, 32, 0.92)',
    glowColor: 'rgba(16, 185, 129, 0.25)',
    delayOffset: 0.15,
    driftRangeY: 8,
    driftDuration: 4.0,
  },
  {
    id: 'nemotron',
    icon: <Cpu size={14} color="#a855f7" />,
    label: 'NVIDIA NEMOTRON 70B',
    sublabel: 'Deep Cybersecurity Reasoning',
    x: '14%',
    y: '45%',
    textColor: '#c084fc',
    borderColor: 'rgba(168, 85, 247, 0.35)',
    bgColor: 'rgba(10, 18, 32, 0.92)',
    glowColor: 'rgba(168, 85, 247, 0.25)',
    delayOffset: 0.25,
    driftRangeY: -6,
    driftDuration: 3.4,
  },
  {
    id: 'langgraph',
    icon: <Sparkles size={14} color="#38bdf8" />,
    label: 'LANGGRAPH 4-AGENT PIPELINE',
    sublabel: 'Threat • Test • Evidence • Verify',
    x: '86%',
    y: '45%',
    textColor: '#7dd3fc',
    borderColor: 'rgba(56, 189, 248, 0.35)',
    bgColor: 'rgba(10, 18, 32, 0.92)',
    glowColor: 'rgba(56, 189, 248, 0.25)',
    delayOffset: 0.35,
    driftRangeY: 7,
    driftDuration: 3.8,
  },
  {
    id: 'secrets',
    icon: <Lock size={14} color="#f43f5e" />,
    label: 'SECRET LEAK DETECTION',
    sublabel: 'High-Entropy Token Defense',
    x: '19%',
    y: '68%',
    textColor: '#fb7185',
    borderColor: 'rgba(244, 63, 94, 0.35)',
    bgColor: 'rgba(10, 18, 32, 0.92)',
    glowColor: 'rgba(244, 63, 94, 0.25)',
    delayOffset: 0.45,
    driftRangeY: -7,
    driftDuration: 3.5,
  },
  {
    id: 'remediation',
    icon: <Terminal size={14} color="#00f0ff" />,
    label: 'AUTOMATED CODE REMEDIATION',
    sublabel: 'Validated Unified Diff Patches',
    x: '81%',
    y: '68%',
    textColor: '#38bdf8',
    borderColor: 'rgba(0, 240, 255, 0.35)',
    bgColor: 'rgba(10, 18, 32, 0.92)',
    glowColor: 'rgba(0, 240, 255, 0.25)',
    delayOffset: 0.55,
    driftRangeY: 8,
    driftDuration: 3.9,
  },
  {
    id: 'cve-osv',
    icon: <Shield size={14} color="#f59e0b" />,
    label: 'CVE & OSV VULNERABILITY AUDITING',
    sublabel: 'Supply Chain Dependency Integrity',
    x: '50%',
    y: '12%',
    textColor: '#fcd34d',
    borderColor: 'rgba(245, 158, 11, 0.35)',
    bgColor: 'rgba(10, 18, 32, 0.92)',
    glowColor: 'rgba(245, 158, 11, 0.25)',
    delayOffset: 0.2,
    driftRangeY: -5,
    driftDuration: 4.2,
  },
  {
    id: 'verification',
    icon: <CheckCircle2 size={14} color="#10b981" />,
    label: 'ZERO-DAY DEFENSE & CI VERIFICATION',
    sublabel: 'Evidence-Backed Quality Gate',
    x: '50%',
    y: '88%',
    textColor: '#34d399',
    borderColor: 'rgba(16, 185, 129, 0.35)',
    bgColor: 'rgba(10, 18, 32, 0.92)',
    glowColor: 'rgba(16, 185, 129, 0.25)',
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
    color: '#38bdf8',
    opacity: 0.05,
    tracking: '0.28em',
  },
  {
    id: 'bg-defense',
    text: 'CYBERSECURITY COMMAND CENTER',
    x: '50%',
    y: '74%',
    fontSize: 'clamp(22px, 4.5vw, 48px)',
    color: '#818cf8',
    opacity: 0.07,
    tracking: '0.22em',
  },
];

export const LogoIntro: React.FC<LogoIntroProps> = ({
  onComplete,
  forcePlay = true,
  durationSeconds = 3.2,
}) => {
  const systemReducedMotion = useReducedMotion();
  // When forcePlay is requested, bypass reducedMotion so the user gets the visual intro
  const shouldReduceMotion = forcePlay ? false : (systemReducedMotion ?? false);

  const [isVisible, setIsVisible] = useState<boolean>(true);

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
      localStorage.setItem('agentguard_intro_seen', 'true');
      sessionStorage.setItem('agentguard_intro_completed', 'true');
    }
    setIsVisible(false);
    if (onComplete) onComplete();
  }, [onComplete]);

  // Handle reduced motion preferences gracefully only when not forced
  useEffect(() => {
    if (shouldReduceMotion && isVisible && !forcePlay) {
      const quickTimer = setTimeout(() => {
        dismissIntro();
      }, 400);
      return () => clearTimeout(quickTimer);
    }
  }, [shouldReduceMotion, isVisible, forcePlay, dismissIntro]);

  // Main orchestrated cinematic timeline
  useEffect(() => {
    if (!isVisible) return;

    // Timeline sequences:
    const tStartAssembly = setTimeout(() => setPhase(1), 80);    // 0.08s: Parts connect from all areas
    const tCircuits = setTimeout(() => setPhase(2), 650);        // 0.65s: Circuits extend & pulse
    const tCompleteSnap = setTimeout(() => setPhase(3), 1250);   // 1.25s: Parts lock & flash shockwave
    const tWordmark = setTimeout(() => setPhase(4), 1600);       // 1.60s: Wordmark & tagline reveal
    const tLogoDoneWords = setTimeout(() => setPhase(5), 2050);  // 2.05s: LOGO DONE -> Background Words activate
    const tFadeOut = setTimeout(() => setPhase(6), durationSeconds * 1000); // 3.20s: Transition
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
  }, [isVisible, durationSeconds, dismissIntro]);

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
            background: '#060b13',
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
                linear-gradient(to right, rgba(56, 189, 248, 0.12) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(56, 189, 248, 0.12) 1px, transparent 1px)
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
              background: 'radial-gradient(circle, rgba(0, 240, 255, 0.18) 0%, rgba(99, 102, 241, 0.12) 40%, rgba(6, 11, 19, 0) 70%)',
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
              background: 'rgba(10, 18, 32, 0.85)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              color: '#e2e8f0',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
            }}
            title="Skip introduction (Esc)"
            aria-label="Skip introduction"
          >
            <span>Skip</span>
            <span style={{ fontSize: '10px', color: '#94a3b8', background: 'rgba(15, 23, 42, 0.8)', padding: '1px 5px', borderRadius: '4px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>Esc</span>
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
                  className="hidden md:flex"
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
                      background: 'rgba(15, 23, 42, 0.9)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid rgba(56, 189, 248, 0.2)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
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
                        color: '#94a3b8',
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
              <AgentGuardVectorMark
                size={195}
                isScanning={phase >= 2}
                isAnalyzing={phase >= 4}
              />
              {phase >= 3 && (
                <motion.div
                  initial={{ scale: 0.6, opacity: 0.9 }}
                  animate={{ scale: 1.8, opacity: 0 }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                  style={{
                    position: 'absolute',
                    inset: '-20px',
                    borderRadius: '50%',
                    border: '2px solid #5eedee',
                    boxShadow: '0 0 24px rgba(94, 237, 238, 0.6)',
                    pointerEvents: 'none',
                  }}
                />
              )}
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
                {/* "AgentGuard" — Crisp White Cyber Wordmark */}
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
                    color: '#ffffff',
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
                    background: 'linear-gradient(135deg, #00f0ff 0%, #a855f7 100%)',
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
                    color: '#94a3b8',
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

export default LogoIntro;
