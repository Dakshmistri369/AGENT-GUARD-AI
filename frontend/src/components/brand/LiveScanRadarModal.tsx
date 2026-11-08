import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Volume2,
  VolumeX,
  RotateCcw,
  Play,
  Pause,
  Shield,
  Zap,
  Lock,
  Cpu,
  Maximize2,
  Minimize2,
} from 'lucide-react';

export interface LiveScanRadarModalProps {
  isOpen: boolean;
  onClose: () => void;
  repoName?: string | null;
  branch?: string | null;
  commitSha?: string | null;
}

export const LiveScanRadarModal: React.FC<LiveScanRadarModalProps> = ({
  isOpen,
  onClose,
  repoName = 'soham04010/CliniqueAI',
  branch = 'main',
  commitSha = 'd8771f5',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(10);

  // Restart video playback when opened
  useEffect(() => {
    if (isOpen && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.muted = isMuted;
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [isOpen]);

  // Handle keyboard shortcuts (Escape to close, Space to toggle play/pause, M to mute/unmute)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === ' ' && e.target === document.body) {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key.toLowerCase() === 'm') {
        toggleMute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isMuted, isPlaying]);

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
    try {
      localStorage.setItem('agentguard_cyber_sound', nextMuted ? 'false' : 'true');
    } catch {}
    if (!nextMuted) {
      videoRef.current.volume = 0.85;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleRestart = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = 0;
    videoRef.current.play().catch(() => {});
    setIsPlaying(true);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
    if (videoRef.current.duration) {
      setDuration(videoRef.current.duration);
    }
  };

  if (!isOpen) return null;

  const progressPercent = Math.min(100, Math.round((currentTime / (duration || 10)) * 100));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AgentGuard AI Live Cyber Scan Radar"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(3, 7, 18, 0.88)',
        backdropFilter: 'blur(10px)',
        padding: '16px',
      }}
    >
      {/* Modal Container */}
      <div
        style={{
          width: isFullscreen ? '98vw' : '960px',
          maxWidth: '100%',
          maxHeight: isFullscreen ? '98vh' : '92vh',
          background: '#040b14',
          borderRadius: '16px',
          border: '1px solid rgba(0, 240, 255, 0.4)',
          boxShadow: '0 25px 60px -15px rgba(0, 240, 255, 0.25), 0 0 40px rgba(16, 185, 129, 0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {/* Top Header Bar */}
        <div
          style={{
            height: '48px',
            background: 'linear-gradient(90deg, #061826 0%, #082136 50%, #061826 100%)',
            borderBottom: '1px solid rgba(0, 240, 255, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#10b981',
                boxShadow: '0 0 10px #10b981',
                animation: 'pulse 1.5s infinite',
              }}
            />
            <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.5px', color: '#00f0ff' }}>
              AGENTGUARD AI // CYBER REPOSITORY RADAR
            </span>
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'rgba(0, 240, 255, 0.12)',
                color: '#38bdf8',
                border: '1px solid rgba(0, 240, 255, 0.25)',
              }}
            >
              {repoName || 'Active Workspace'} [{branch} • {commitSha ? commitSha.slice(0, 7) : 'HEAD'}]
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* Audio Toggle */}
            <button
              onClick={toggleMute}
              title={isMuted ? 'Unmute Cyber Sound (M)' : 'Mute Sound (M)'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: isMuted ? '1px solid #334155' : '1px solid rgba(16, 185, 129, 0.5)',
                background: isMuted ? 'rgba(30, 41, 59, 0.5)' : 'rgba(16, 185, 129, 0.15)',
                color: isMuted ? '#94a3b8' : '#34d399',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              <span>{isMuted ? 'Sound Off' : 'Cyber SFX On'}</span>
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              title="Close Visualizer (Esc)"
              style={{
                background: 'rgba(244, 63, 94, 0.12)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                color: '#f43f5e',
                borderRadius: '6px',
                cursor: 'pointer',
                padding: '5px 7px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Video Player Display */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            background: '#000000',
            aspectRatio: '16 / 9',
            overflow: 'hidden',
          }}
        >
          <video
            ref={videoRef}
            src="/videos/agentguard_repo_scanner.mp4"
            autoPlay
            loop
            muted={isMuted}
            playsInline
            onTimeUpdate={handleTimeUpdate}
            onClick={togglePlayPause}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
              cursor: 'pointer',
            }}
          />

          {/* Quick HUD controls overlay on hover */}
          <div
            style={{
              position: 'absolute',
              bottom: '12px',
              left: '16px',
              right: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(4, 11, 20, 0.85)',
              backdropFilter: 'blur(8px)',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(0, 240, 255, 0.25)',
              zIndex: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                onClick={togglePlayPause}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#00f0ff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                {isPlaying ? <Pause size={15} /> : <Play size={15} />}
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
              </button>

              <button
                onClick={handleRestart}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                }}
              >
                <RotateCcw size={14} />
                <span>Restart</span>
              </button>
            </div>

            {/* Timeline Progress */}
            <div style={{ flex: 1, margin: '0 20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  flex: 1,
                  height: '6px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '3px',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    width: `${progressPercent}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #00f0ff 0%, #10b981 100%)',
                    boxShadow: '0 0 8px rgba(0, 240, 255, 0.7)',
                    transition: 'width 0.1s linear',
                  }}
                />
              </div>
              <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#38bdf8', minWidth: '40px' }}>
                {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
              </span>
            </div>

            <div style={{ fontSize: '12px', fontWeight: 700, color: '#10b981', letterSpacing: '0.5px' }}>
              {progressPercent}% AUDITED
            </div>
          </div>
        </div>

        {/* Bottom Engine Telemetry Ticker */}
        <div
          style={{
            padding: '12px 16px',
            background: '#030811',
            borderTop: '1px solid rgba(0, 240, 255, 0.15)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '10px',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={14} color="#00f0ff" />
            <span style={{ color: '#94a3b8' }}>Semgrep SAST:</span>
            <span style={{ color: '#38bdf8', fontWeight: 600 }}>Taint Pattern Analysis</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={14} color="#10b981" />
            <span style={{ color: '#94a3b8' }}>Bandit Engine:</span>
            <span style={{ color: '#34d399', fontWeight: 600 }}>Python AST Linting</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lock size={14} color="#f59e0b" />
            <span style={{ color: '#94a3b8' }}>detect-secrets:</span>
            <span style={{ color: '#fbbf24', fontWeight: 600 }}>Entropy Classification</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cpu size={14} color="#a855f7" />
            <span style={{ color: '#94a3b8' }}>OSV Database:</span>
            <span style={{ color: '#c084fc', fontWeight: 600 }}>Lockfile CVE Cross-Ref</span>
          </div>
        </div>
      </div>
    </div>
  );
};
