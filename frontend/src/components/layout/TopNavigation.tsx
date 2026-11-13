import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Sparkles,
  Settings,
  GitBranch,
  RefreshCw,
  ExternalLink,
  Play,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { Repository } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { SHOW_SIGN_IN_BUTTON } from '../../config/authFeatures';
import { BackgroundScanIndicator } from '../scans/BackgroundScanIndicator';
import { API_BASE_URL } from '../../lib/api';

export interface TopNavigationProps {
  repositories?: Repository[];
  selectedRepoId?: number | null;
  onSelectRepo?: (repoId: number) => void;
  isScanning?: boolean;
  activeScanRepoName?: string | null;
  onOpenAiAssistant?: () => void;
  onToggleMobileNav?: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export const TopNavigation: React.FC<TopNavigationProps> = ({
  repositories = [],
  selectedRepoId,
  onSelectRepo,
  isScanning = false,
  activeScanRepoName,
  onOpenAiAssistant,
  onToggleMobileNav,
  isSidebarCollapsed = false,
  onToggleSidebar,
}) => {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [isCyberSoundActive, setIsCyberSoundActive] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('agentguard_cyber_sound') === 'true';
    } catch {
      return false;
    }
  });

  // Determine page title for breadcrumb
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return 'Overview';
    if (path.startsWith('/repositories')) return 'Repositories';
    if (path.startsWith('/findings')) return 'Findings';
    if (path.startsWith('/history')) return 'Scan History';
    if (path.startsWith('/compare')) return 'Scan Comparison';
    if (path.startsWith('/projects')) return 'Projects';
    if (path.startsWith('/settings')) return 'Settings';
    if (path.startsWith('/remediation')) return 'Remediation';
    if (path.startsWith('/rules')) return 'Security Rules';
    return 'Overview';
  };

  return (
    <header
      className="pt-safe"
      style={{
        height: '56px',
        background: 'rgba(6, 11, 20, 0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(56, 189, 248, 0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        position: 'sticky',
        top: 0,
        zIndex: 30,
      }}
    >
      {/* Left: Breadcrumbs, Hamburger & Active Repository context */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', minWidth: 0 }}>
        {onToggleMobileNav && (
          <button
            onClick={onToggleMobileNav}
            aria-label="Open navigation"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: '#94a3b8',
              cursor: 'pointer',
              marginLeft: '-4px',
              flexShrink: 0,
            }}
            className="lg:hidden"
          >
            <Menu size={22} />
          </button>
        )}

        {/* Desktop Sidebar Toggle Button (expand / collapse sidebar anytime) */}
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            aria-label={isSidebarCollapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
            title={isSidebarCollapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
            className="hidden lg:flex"
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              border: '1px solid rgba(56, 189, 248, 0.22)',
              background: isSidebarCollapsed ? 'rgba(0, 240, 255, 0.12)' : 'rgba(15, 23, 42, 0.8)',
              color: isSidebarCollapsed ? '#00f0ff' : '#94a3b8',
              cursor: 'pointer',
              marginRight: '6px',
              transition: 'all 0.15s ease',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isSidebarCollapsed ? 'rgba(0, 240, 255, 0.2)' : 'rgba(30, 41, 59, 0.9)';
              e.currentTarget.style.borderColor = 'rgba(0, 240, 255, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isSidebarCollapsed ? 'rgba(0, 240, 255, 0.12)' : 'rgba(15, 23, 42, 0.8)';
              e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.22)';
            }}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        )}

        {/* Cyber Breadcrumbs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          <span className="hidden sm:inline" style={{ color: '#00f0ff', fontWeight: 700, letterSpacing: '0.4px', fontSize: '12px' }}>
            AGENTGUARD AI
          </span>
          <span style={{ color: 'rgba(0, 240, 255, 0.4)', fontWeight: 600, fontSize: '12px' }}>//</span>
          <span
            style={{
              color: '#ffffff',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '120px',
              letterSpacing: '0.2px',
            }}
            className="sm:max-w-none"
          >
            {getPageTitle()}
          </span>
        </div>

        {/* Repository context selector pill */}
        {repositories.length > 0 && onSelectRepo && (
          <div className="hidden md:flex" style={{ marginLeft: '12px', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'rgba(56, 189, 248, 0.3)', fontSize: '12px' }}>|</span>
            <GitBranch size={13} color="#00f0ff" />
            <select
              value={selectedRepoId || ''}
              onChange={(e) => onSelectRepo(Number(e.target.value))}
              style={{
                background: 'rgba(10, 18, 32, 0.85)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: '6px',
                color: '#f8fafc',
                fontSize: '12px',
                fontWeight: 600,
                padding: '4px 8px',
                cursor: 'pointer',
                outline: 'none',
                maxWidth: '180px',
              }}
              aria-label="Filter context by connected repository"
            >
              <option value="" style={{ background: '#0a1220', color: '#94a3b8' }}>
                All Repositories ({repositories.length})
              </option>
              {repositories.map((repo) => (
                <option key={repo.id} value={repo.id} style={{ background: '#0a1220', color: '#f8fafc' }}>
                  {repo.full_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Live scanning pill */}
        {isScanning && (
          <div
            style={{
              marginLeft: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              fontWeight: 600,
              color: '#34d399',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              padding: '2px 8px',
              borderRadius: '9999px',
              whiteSpace: 'nowrap',
            }}
          >
            <RefreshCw size={11} className="animate-spin" />
            <span className="hidden sm:inline">Auditing {activeScanRepoName || 'Repository'}…</span>
            <span className="sm:hidden">Scanning…</span>
          </div>
        )}
      </div>

      {/* Right: Quick actions, AI assistant, user pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {/* Background Scan Activity Indicator (always visible across all pages) */}
        <BackgroundScanIndicator />

        {/* Cinematic Animated Logo Intro Button */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            if (typeof window !== 'undefined') {
              sessionStorage.removeItem('agentguard_intro_completed');
              localStorage.removeItem('agentguard_intro_seen');
              window.dispatchEvent(new CustomEvent('agentguard:replay-intro'));
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            fontWeight: 600,
            color: '#38bdf8',
            background: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '6px',
            padding: '5px 11px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(56, 189, 248, 0.22)';
            e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(56, 189, 248, 0.12)';
            e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.3)';
          }}
          title="Play Cinematic Logo & Cybersecurity Animation"
          aria-label="Play Cinematic Logo & Cybersecurity Animation"
        >
          <Play size={12} color="#38bdf8" fill="#38bdf8" />
          <span className="hidden sm:inline">Intro</span>
        </button>

        {/* Cyber Radar Visualizer Button */}
        <button
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('agentguard:open-cyber-radar', {
                  detail: {
                    repoName: repositories.find((r) => r.id === selectedRepoId)?.full_name || activeScanRepoName || 'Target Repository',
                  },
                })
              );
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            fontWeight: 700,
            color: '#00f0ff',
            background: 'rgba(0, 240, 255, 0.12)',
            border: '1px solid rgba(0, 240, 255, 0.35)',
            borderRadius: '6px',
            padding: '6px 11px',
            cursor: 'pointer',
            minHeight: '36px',
            boxShadow: '0 0 12px rgba(0, 240, 255, 0.15)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(0, 240, 255, 0.22)';
            e.currentTarget.style.borderColor = '#00f0ff';
            e.currentTarget.style.boxShadow = '0 0 18px rgba(0, 240, 255, 0.35)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(0, 240, 255, 0.12)';
            e.currentTarget.style.borderColor = 'rgba(0, 240, 255, 0.35)';
            e.currentTarget.style.boxShadow = '0 0 12px rgba(0, 240, 255, 0.15)';
          }}
          title="Open Live Cyber Scan Radar Visualizer with Sound Effects"
          aria-label="Open Live Cyber Scan Radar"
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#10b981',
              boxShadow: '0 0 8px #10b981',
              animation: 'pulse 1.5s infinite',
            }}
          />
          <Radio size={13} color="#00f0ff" />
          <span className="hidden sm:inline">Cyber Radar</span>
        </button>

        {/* Audio Sound FX Toggle */}
        <button
          onClick={() => {
            const nextSound = !isCyberSoundActive;
            setIsCyberSoundActive(nextSound);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('agentguard:toggle-cyber-sound', {
                  detail: { muted: !nextSound },
                })
              );
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            borderRadius: '6px',
            border: isCyberSoundActive ? '1px solid rgba(16, 185, 129, 0.55)' : '1px solid rgba(56, 189, 248, 0.2)',
            background: isCyberSoundActive ? 'rgba(16, 185, 129, 0.18)' : 'rgba(15, 23, 42, 0.6)',
            color: isCyberSoundActive ? '#34d399' : '#64748b',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          title={isCyberSoundActive ? 'Mute Cyber Audio Effects' : 'Enable Cyber Audio Effects'}
          aria-label="Toggle Cyber Sound"
        >
          {isCyberSoundActive ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>

        {/* AI Assistant shortcut */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            if (onOpenAiAssistant) {
              onOpenAiAssistant();
            } else if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('agentguard:open-ai-assistant'));
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '12px',
            fontWeight: 600,
            color: '#38bdf8',
            background: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '6px',
            padding: '6px 10px',
            cursor: 'pointer',
            minHeight: '36px',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(56, 189, 248, 0.22)';
            e.currentTarget.style.borderColor = '#38bdf8';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(56, 189, 248, 0.12)';
            e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.3)';
          }}
          title="Open AI Security Assistant (Nemotron & LangGraph)"
          aria-label="Open AI Security Assistant"
        >
          <Sparkles size={13} color="#38bdf8" />
          <span className="hidden sm:inline">AI Assistant</span>
        </button>

        {/* External Docs (desktop only) */}
        <a
          href={`${API_BASE_URL}/docs`}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:flex"
          style={{
            color: '#cbd5e1',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            borderRadius: '6px',
            textDecoration: 'none',
          }}
          title="Open FastAPI Swagger Documentation"
        >
          <ExternalLink size={15} />
        </a>

        {/* Settings link */}
        <Link
          to="/settings"
          style={{
            color: '#cbd5e1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            borderRadius: '6px',
            textDecoration: 'none',
          }}
          title="Settings & Configurations"
        >
          <Settings size={16} />
        </Link>

        {/* User Pill dynamic */}
        {user ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 8px',
              borderRadius: '8px',
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(56, 189, 248, 0.2)',
            }}
          >
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                background: 'linear-gradient(135deg, #0284c7 0%, #10b981 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
              }}
            >
              {user.email ? user.email[0] : 'U'}
            </div>
            <div className="hidden sm:block" style={{ lineHeight: 1.1 }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff' }}>
                {user.email ? user.email.split('@')[0] : 'User'}
              </div>
              <div style={{ fontSize: '10px', color: '#cbd5e1' }}>Security Auditor</div>
            </div>
            <button
              onClick={() => signOut()}
              title="Sign Out"
              aria-label="Sign Out"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#cbd5e1',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 8px',
                borderRadius: '6px',
                background: 'rgba(0, 240, 255, 0.1)',
                border: '1px solid rgba(0, 240, 255, 0.28)',
                color: '#00f0ff',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.2px',
                whiteSpace: 'nowrap',
              }}
              title="AgentGuard AI is running in Demo Mode"
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#10b981',
                  boxShadow: '0 0 6px #10b981',
                }}
              />
              Demo
            </div>
            {SHOW_SIGN_IN_BUTTON && (
              <Link
                to="/login"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  boxShadow: '0 2px 4px rgba(2, 132, 199, 0.3)',
                  whiteSpace: 'nowrap',
                }}
              >
                Sign In
              </Link>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
