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
        background: 'rgba(13, 14, 17, 0.95)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(62, 73, 72, 0.35)',
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
              borderRadius: '4px',
              border: 'none',
              background: 'transparent',
              color: '#889392',
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
              borderRadius: '4px',
              border: '1px solid rgba(62, 73, 72, 0.45)',
              background: isSidebarCollapsed ? 'rgba(139, 223, 221, 0.12)' : '#1b1b1f',
              color: isSidebarCollapsed ? '#a7fcfa' : '#889392',
              cursor: 'pointer',
              marginRight: '6px',
              transition: 'all 0.15s ease',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isSidebarCollapsed ? 'rgba(139, 223, 221, 0.2)' : '#292a2d';
              e.currentTarget.style.borderColor = 'rgba(139, 223, 221, 0.4)';
              e.currentTarget.style.color = '#a7fcfa';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isSidebarCollapsed ? 'rgba(139, 223, 221, 0.12)' : '#1b1b1f';
              e.currentTarget.style.borderColor = 'rgba(62, 73, 72, 0.45)';
              e.currentTarget.style.color = isSidebarCollapsed ? '#a7fcfa' : '#889392';
            }}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        )}

        {/* Cyber Breadcrumbs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, fontFamily: "'JetBrains Mono', monospace" }}>
          <span className="hidden sm:inline" style={{ color: '#889392', fontWeight: 600, letterSpacing: '0.06em', fontSize: '11px', textTransform: 'uppercase' }}>
            agentguard
          </span>
          <span style={{ color: 'rgba(62, 73, 72, 0.8)', fontWeight: 600, fontSize: '12px' }}>/</span>
          <span
            style={{
              color: '#e3e2e6',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '140px',
              letterSpacing: '0.02em',
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
              fontSize: '13px',
            }}
            className="sm:max-w-none"
          >
            {getPageTitle()}
          </span>
        </div>

        {/* Repository context selector pill */}
        {repositories.length > 0 && onSelectRepo && (
          <div className="hidden md:flex" style={{ marginLeft: '12px', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'rgba(62, 73, 72, 0.6)', fontSize: '12px' }}>|</span>
            <GitBranch size={13} color="#8bdfdd" />
            <select
              value={selectedRepoId || ''}
              onChange={(e) => onSelectRepo(Number(e.target.value))}
              style={{
                background: '#1b1b1f',
                border: '1px solid rgba(62, 73, 72, 0.5)',
                borderRadius: '4px',
                color: '#e3e2e6',
                fontSize: '12px',
                fontWeight: 600,
                padding: '4px 8px',
                cursor: 'pointer',
                outline: 'none',
                maxWidth: '180px',
                fontFamily: "'Inter', sans-serif",
              }}
              aria-label="Filter context by connected repository"
            >
              <option value="" style={{ background: '#1b1b1f', color: '#bdc9c8' }}>
                All Repositories ({repositories.length})
              </option>
              {repositories.map((repo) => (
                <option key={repo.id} value={repo.id} style={{ background: '#1b1b1f', color: '#e3e2e6' }}>
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
              color: '#a7fcfa',
              background: 'rgba(139, 223, 221, 0.12)',
              border: '1px solid rgba(139, 223, 221, 0.35)',
              padding: '2px 8px',
              borderRadius: '4px',
              whiteSpace: 'nowrap',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            <RefreshCw size={11} className="animate-spin text-[#8bdfdd]" />
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
            fontSize: '11.5px',
            fontWeight: 600,
            color: '#e3e2e6',
            background: '#1b1b1f',
            border: '1px solid rgba(62, 73, 72, 0.45)',
            borderRadius: '4px',
            padding: '5px 10px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            fontFamily: "'JetBrains Mono', monospace",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#292a2d';
            e.currentTarget.style.borderColor = 'rgba(255, 180, 166, 0.5)';
            e.currentTarget.style.color = '#ffb4a6';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#1b1b1f';
            e.currentTarget.style.borderColor = 'rgba(62, 73, 72, 0.45)';
            e.currentTarget.style.color = '#e3e2e6';
          }}
          title="Play Cinematic Logo & Cybersecurity Animation"
          aria-label="Play Cinematic Logo & Cybersecurity Animation"
        >
          <Play size={12} color="#ffb4a6" fill="#ffb4a6" />
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
          className="pulse-glow-cyan"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11.5px',
            fontWeight: 600,
            color: '#a7fcfa',
            background: 'rgba(139, 223, 221, 0.1)',
            border: '1px solid rgba(139, 223, 221, 0.35)',
            borderRadius: '4px',
            padding: '5px 10px',
            cursor: 'pointer',
            minHeight: '34px',
            boxShadow: '0 0 12px rgba(139, 223, 221, 0.15)',
            transition: 'all 0.15s ease',
            fontFamily: "'JetBrains Mono', monospace",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(139, 223, 221, 0.2)';
            e.currentTarget.style.borderColor = '#8bdfdd';
            e.currentTarget.style.boxShadow = '0 0 16px rgba(139, 223, 221, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(139, 223, 221, 0.1)';
            e.currentTarget.style.borderColor = 'rgba(139, 223, 221, 0.35)';
            e.currentTarget.style.boxShadow = '0 0 12px rgba(139, 223, 221, 0.15)';
          }}
          title="Open Live Cyber Scan Radar Visualizer with Sound Effects"
          aria-label="Open Live Cyber Scan Radar"
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#8bdfdd',
              boxShadow: '0 0 6px rgba(139, 223, 221, 0.8)',
            }}
          />
          <Radio size={13} color="#a7fcfa" />
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
            width: '34px',
            height: '34px',
            borderRadius: '4px',
            border: isCyberSoundActive ? '1px solid rgba(139, 223, 221, 0.45)' : '1px solid rgba(62, 73, 72, 0.45)',
            background: isCyberSoundActive ? 'rgba(139, 223, 221, 0.14)' : '#1b1b1f',
            color: isCyberSoundActive ? '#a7fcfa' : '#889392',
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
            fontSize: '11.5px',
            fontWeight: 600,
            color: '#e3e2e6',
            background: '#1f1f23',
            border: '1px solid rgba(62, 73, 72, 0.5)',
            borderRadius: '4px',
            padding: '5px 10px',
            cursor: 'pointer',
            minHeight: '34px',
            transition: 'all 0.15s ease',
            fontFamily: "'JetBrains Mono', monospace",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#292a2d';
            e.currentTarget.style.borderColor = 'rgba(139, 223, 221, 0.5)';
            e.currentTarget.style.color = '#a7fcfa';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#1f1f23';
            e.currentTarget.style.borderColor = 'rgba(62, 73, 72, 0.5)';
            e.currentTarget.style.color = '#e3e2e6';
          }}
          title="Open AI Security Assistant (Nemotron & LangGraph)"
          aria-label="Open AI Security Assistant"
        >
          <Sparkles size={13} color="#8bdfdd" />
          <span className="hidden sm:inline">AI Assistant</span>
        </button>

        {/* External Docs (desktop only) */}
        <a
          href={`${API_BASE_URL}/docs`}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:flex"
          style={{
            color: '#889392',
            alignItems: 'center',
            justifyContent: 'center',
            width: '34px',
            height: '34px',
            borderRadius: '4px',
            textDecoration: 'none',
            border: '1px solid rgba(62, 73, 72, 0.35)',
            background: '#1b1b1f',
          }}
          title="Open FastAPI Swagger Documentation"
        >
          <ExternalLink size={15} />
        </a>

        {/* Settings link */}
        <Link
          to="/settings"
          style={{
            color: '#889392',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '34px',
            height: '34px',
            borderRadius: '4px',
            textDecoration: 'none',
            border: '1px solid rgba(62, 73, 72, 0.35)',
            background: '#1b1b1f',
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
              borderRadius: '4px',
              background: '#1b1b1f',
              border: '1px solid rgba(62, 73, 72, 0.5)',
            }}
          >
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '4px',
                background: 'linear-gradient(135deg, #00504f 0%, #81d5d3 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#00201f',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              {user.email ? user.email[0] : 'U'}
            </div>
            <div className="hidden sm:block" style={{ lineHeight: 1.1 }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#e3e2e6' }}>
                {user.email ? user.email.split('@')[0] : 'User'}
              </div>
              <div style={{ fontSize: '10px', color: '#889392', fontFamily: "'JetBrains Mono', monospace" }}>Security Auditor</div>
            </div>
            <button
              onClick={() => signOut()}
              title="Sign Out"
              aria-label="Sign Out"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#889392',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#ffb4ab')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#889392')}
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
                borderRadius: '4px',
                background: 'rgba(143, 17, 3, 0.25)',
                border: '1px solid rgba(255, 180, 166, 0.35)',
                color: '#ffb4a6',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.04em',
                fontFamily: "'JetBrains Mono', monospace",
                whiteSpace: 'nowrap',
              }}
              title="AgentGuard AI is running in Demo Mode"
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#ffb4a6',
                  boxShadow: '0 0 6px rgba(255, 180, 166, 0.8)',
                }}
              />
              Demo Mode
            </div>
            {SHOW_SIGN_IN_BUTTON && (
              <Link
                to="/login"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 10px',
                  borderRadius: '4px',
                  background: '#8bdfdd',
                  color: '#003736',
                  fontSize: '12px',
                  fontWeight: 700,
                  textDecoration: 'none',
                  fontFamily: "'Space Grotesk', sans-serif",
                  boxShadow: '0 0 10px rgba(139, 223, 221, 0.3)',
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
