import React, { useEffect, useRef, useState } from 'react';

export interface CyberScanBackgroundProps {
  /** Optional custom opacity (0.0 to 1.0), defaults to 0.28 */
  opacity?: number;
  /** Force disable background video */
  disabled?: boolean;
}

export const CyberScanBackground: React.FC<CyberScanBackgroundProps> = ({
  opacity = 0.28,
  disabled = false,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [isEnabled, setIsEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const stored = localStorage.getItem('agentguard_cyber_bg');
      return stored !== 'false';
    } catch {
      return true;
    }
  });

  const [isMuted, setIsMuted] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      return localStorage.getItem('agentguard_cyber_sound') !== 'true';
    } catch {
      return true;
    }
  });

  // Listen for global custom events to toggle background or audio
  useEffect(() => {
    const handleToggleBg = (e: Event) => {
      const customEvent = e as CustomEvent<{ enabled?: boolean }>;
      setIsEnabled((prev) => {
        const next = customEvent.detail?.enabled !== undefined ? customEvent.detail.enabled : !prev;
        try {
          localStorage.setItem('agentguard_cyber_bg', String(next));
        } catch {}
        return next;
      });
    };

    const handleToggleSound = (e: Event) => {
      const customEvent = e as CustomEvent<{ muted?: boolean }>;
      setIsMuted((prev) => {
        const next = customEvent.detail?.muted !== undefined ? customEvent.detail.muted : !prev;
        try {
          localStorage.setItem('agentguard_cyber_sound', next ? 'false' : 'true');
        } catch {}
        if (videoRef.current) {
          videoRef.current.muted = next;
          if (!next) {
            videoRef.current.volume = 0.65;
            videoRef.current.play().catch(() => {});
          }
        }
        return next;
      });
    };

    window.addEventListener('agentguard:toggle-cyber-bg', handleToggleBg);
    window.addEventListener('agentguard:toggle-cyber-sound', handleToggleSound);

    return () => {
      window.removeEventListener('agentguard:toggle-cyber-bg', handleToggleBg);
      window.removeEventListener('agentguard:toggle-cyber-sound', handleToggleSound);
    };
  }, []);

  // Sync mute state to video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
      if (!isMuted) {
        videoRef.current.volume = 0.65;
        videoRef.current.play().catch(() => {});
      }
    }
  }, [isMuted]);

  // Performance optimization: Pause video when tab/window is hidden to save 0% CPU
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!videoRef.current) return;
      if (document.hidden) {
        videoRef.current.pause();
      } else if (isEnabled && !disabled) {
        videoRef.current.play().catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isEnabled, disabled]);

  if (!isEnabled || disabled) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        background: '#090d16',
      }}
    >
      {/* High-speed hardware-accelerated video layer */}
      <video
        ref={videoRef}
        autoPlay
        loop
        muted={isMuted}
        playsInline
        preload="auto"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '100%',
          height: '100%',
          minWidth: '100%',
          minHeight: '100%',
          transform: 'translate(-50%, -50%) translate3d(0, 0, 0)',
          objectFit: 'cover',
          opacity: opacity,
          filter: 'brightness(0.95) contrast(1.15) saturate(1.2)',
          willChange: 'transform, opacity',
        }}
      >
        <source src="/videos/agentguard_repo_scanner.webm" type="video/webm" />
        <source src="/videos/agentguard_repo_scanner.mp4" type="video/mp4" />
      </video>

      {/* Cyber gradient vignette overlay ensuring high contrast readability */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 50% 45%, rgba(9, 13, 22, 0.45) 0%, rgba(9, 13, 22, 0.82) 65%, rgba(4, 7, 14, 0.95) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Subtle scanline grid lines */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(0, 240, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 240, 255, 0.03) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          opacity: 0.6,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
