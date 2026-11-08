import React, { useEffect, useRef, useState } from 'react';
import {
  Volume2,
  VolumeX,
  Play,
  Pause,
  RotateCcw,
  Zap,
  Shield,
  Lock,
  Cpu,
  ChevronDown,
  ChevronUp,
  Maximize2,
} from 'lucide-react';
import type { Scan } from '../../types';

export interface EmbeddedCyberRadarProps {
  scan: Scan | null;
  isScanning: boolean;
  repoName: string;
  branch: string;
  commitSha?: string | null;
  defaultExpanded?: boolean;
}

export const EmbeddedCyberRadar: React.FC<EmbeddedCyberRadarProps> = ({
  scan,
  isScanning,
  repoName,
  branch,
  commitSha,
  defaultExpanded = true,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('agentguard_cyber_sound') !== 'true';
    } catch {
      return false;
    }
  });

  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(10);

  // Sync mute with global audio events
  useEffect(() => {
    const handleToggleSound = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const nextMuted = detail.muted !== undefined ? detail.muted : !isMuted;
      setIsMuted(nextMuted);
      if (videoRef.current) {
        videoRef.current.muted = nextMuted;
      }
    };
    window.addEventListener('agentguard:toggle-cyber-sound', handleToggleSound);
    return () => window.removeEventListener('agentguard:toggle-cyber-sound', handleToggleSound);
  }, [isMuted]);

  // Autoplay or pause on visibility change
  useEffect(() => {
    const handleVisibility = () => {
      if (!videoRef.current) return;
      if (document.hidden) {
        videoRef.current.pause();
      } else if (isPlaying && isExpanded) {
        videoRef.current.play().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isPlaying, isExpanded]);

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

  // Compute calculated progress
  const calculatedPercent =
    scan?.status === 'completed'
      ? 100
      : scan?.status === 'failed'
      ? 100
      : scan?.configuration?.progress_percent ||
        (scan?.stage === 'validating'
          ? 15
          : scan?.stage === 'fetching_metadata'
          ? 30
          : scan?.stage === 'inspecting_file_tree'
          ? 50
          : scan?.stage === 'running_scanners'
          ? 75
          : scan?.stage === 'reviewing_evidence'
          ? 90
          : scan?.stage === 'generating_report'
          ? 98
          : isScanning
          ? Math.min(95, Math.round((currentTime / (duration || 10)) * 100))
          : 100);

  const stageLabel = scan?.stage
    ? scan.stage.replace(/_/g, ' ').toUpperCase()
    : isScanning
    ? 'ACTIVE REPOSITORY AUDIT'
    : scan?.status === 'completed'
    ? 'SECURITY POSTURE VERIFIED'
    : scan?.status === 'failed'
    ? 'AUDIT TERMINATED'
    : 'STANDBY';

  return (
    <div
      style={{
        borderRadius: '12px',
        border: '1px solid rgba(0, 240, 255, 0.35)',
        background: '#040b14',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(0, 240, 255, 0.12)',
        overflow: 'hidden',
        marginBottom: '16px',
        transition: 'all 0.25s ease',
      }}
    >
      {/* Console Top Header Bar */}
      <div
        style={{
          height: '44px',
          background: 'linear-gradient(90deg, #061826 0%, #082136 50%, #061826 100%)',
          borderBottom: '1px solid rgba(0, 240, 255, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 14px',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: isScanning ? '#10b981' : scan?.status === 'failed' ? '#f43f5e' : '#00f0ff',
              boxShadow: isScanning
                ? '0 0 10px #10b981'
                : scan?.status === 'failed'
                ? '0 0 10px #f43f5e'
                : '0 0 10px #00f0ff',
              animation: isScanning ? 'pulse 1.5s infinite' : 'none',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: '12px',
              fontWeight: 800,
              letterSpacing: '0.6px',
              color: '#00f0ff',
              whiteSpace: 'nowrap',
            }}
          >
            CYBER SCAN RADAR
          </span>
          <span
            style={{
              fontSize: '11px',
              padding: '1px 7px',
              borderRadius: '4px',
              background: 'rgba(0, 240, 255, 0.12)',
              color: '#38bdf8',
              border: '1px solid rgba(0, 240, 255, 0.25)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '220px',
            }}
            className="hidden sm:inline"
            title={`${repoName} [${branch} • ${commitSha ? commitSha.slice(0, 7) : 'HEAD'}]`}
          >
            {repoName} [{branch} • {commitSha ? commitSha.slice(0, 7) : 'HEAD'}]
          </span>
          <span
            style={{
              fontSize: '10.5px',
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: '4px',
              background: isScanning
                ? 'rgba(16, 185, 129, 0.15)'
                : scan?.status === 'failed'
                ? 'rgba(244, 63, 94, 0.15)'
                : 'rgba(56, 189, 248, 0.15)',
              color: isScanning ? '#34d399' : scan?.status === 'failed' ? '#fb7185' : '#38bdf8',
              border: `1px solid ${
                isScanning
                  ? 'rgba(16, 185, 129, 0.35)'
                  : scan?.status === 'failed'
                  ? 'rgba(244, 63, 94, 0.35)'
                  : 'rgba(56, 189, 248, 0.35)'
              }`,
              letterSpacing: '0.4px',
            }}
          >
            {stageLabel}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Sound toggle button */}
          <button
            onClick={toggleMute}
            title={isMuted ? 'Unmute Cyber SFX' : 'Mute Cyber SFX'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '4px',
              border: isMuted ? '1px solid #334155' : '1px solid rgba(16, 185, 129, 0.5)',
              background: isMuted ? 'rgba(30, 41, 59, 0.5)' : 'rgba(16, 185, 129, 0.15)',
              color: isMuted ? '#94a3b8' : '#34d399',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
            <span className="hidden md:inline">{isMuted ? 'Muted' : 'SFX On'}</span>
          </button>

          {/* Open in full visualizer modal */}
          <button
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('agentguard:open-cyber-radar', {
                  detail: { repoName, branch, commitSha },
                })
              );
            }}
            title="Open in Popout Visualizer"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px 6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Maximize2 size={14} />
          </button>

          {/* Collapse / Expand toggle */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Collapse Radar HUD' : 'Expand Radar HUD'}
            style={{
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              color: '#38bdf8',
              borderRadius: '4px',
              cursor: 'pointer',
              padding: '3px 6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Expandable Video & Telemetry Body */}
      {isExpanded && (
        <>
          <div
            style={{
              position: 'relative',
              width: '100%',
              background: '#000000',
              aspectRatio: '21 / 9',
              maxHeight: '340px',
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

            {/* Bottom In-Video Control Strip */}
            <div
              style={{
                position: 'absolute',
                bottom: '10px',
                left: '12px',
                right: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(4, 11, 20, 0.88)',
                backdropFilter: 'blur(8px)',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid rgba(0, 240, 255, 0.25)',
                zIndex: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={togglePlayPause}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#00f0ff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                >
                  {isPlaying ? <Pause size={13} /> : <Play size={13} />}
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
                    gap: '4px',
                    fontSize: '11px',
                  }}
                >
                  <RotateCcw size={12} />
                  <span className="hidden sm:inline">Loop</span>
                </button>
              </div>

              {/* Progress Bar & Telemetry */}
              <div style={{ flex: 1, margin: '0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    flex: 1,
                    height: '5px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '3px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${calculatedPercent}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #00f0ff 0%, #10b981 100%)',
                      boxShadow: '0 0 8px rgba(0, 240, 255, 0.7)',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
                <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#38bdf8', minWidth: '35px' }}>
                  {calculatedPercent}%
                </span>
              </div>

              <div style={{ fontSize: '11px', fontWeight: 700, color: '#10b981', letterSpacing: '0.5px' }}>
                {isScanning ? 'ACTIVE AUDIT' : 'CALIBRATED'}
              </div>
            </div>
          </div>

          {/* Engine Telemetry Strip */}
          <div
            style={{
              padding: '10px 14px',
              background: '#030811',
              borderTop: '1px solid rgba(0, 240, 255, 0.15)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '8px',
              fontSize: '11.5px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Zap size={13} color="#00f0ff" />
              <span style={{ color: '#94a3b8' }}>Semgrep:</span>
              <span style={{ color: '#38bdf8', fontWeight: 600 }}>Taint Analysis</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Shield size={13} color="#10b981" />
              <span style={{ color: '#94a3b8' }}>Bandit Engine:</span>
              <span style={{ color: '#34d399', fontWeight: 600 }}>Python AST Linting</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Lock size={13} color="#f59e0b" />
              <span style={{ color: '#94a3b8' }}>detect-secrets:</span>
              <span style={{ color: '#fbbf24', fontWeight: 600 }}>Entropy Classification</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Cpu size={13} color="#a855f7" />
              <span style={{ color: '#94a3b8' }}>OSV Database:</span>
              <span style={{ color: '#c084fc', fontWeight: 600 }}>CVE Vulnerabilities</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
