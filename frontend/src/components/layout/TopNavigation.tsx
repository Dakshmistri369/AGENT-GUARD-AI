import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Sparkles,
  Settings,
  ChevronRight,
  GitBranch,
  RefreshCw,
  ExternalLink,
  Play,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import type { Repository } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { SHOW_SIGN_IN_BUTTON } from '../../config/authFeatures';

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

  // Determine page title for breadcrumb
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return 'Dashboard';
    if (path.startsWith('/repositories')) return 'Repositories';
    if (path.startsWith('/findings')) return 'Findings Explorer';
    if (path.startsWith('/history')) return 'Scan History';
    if (path.startsWith('/compare')) return 'Scan Comparison';
    if (path.startsWith('/projects')) return 'Projects';
    if (path.startsWith('/settings')) return 'Settings';
    if (path.startsWith('/remediation')) return 'Remediation Preview';
    if (path.startsWith('/rules')) return 'Security Rules';
    return 'Dashboard';
  };

  return (
    <header
      className="pt-safe"
      style={{
        height: '56px',
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
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
              color: '#334155',
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
              border: '1px solid #e2e8f0',
              background: isSidebarCollapsed ? '#eff6ff' : '#ffffff',
              color: isSidebarCollapsed ? '#2563eb' : '#475569',
              cursor: 'pointer',
              marginRight: '6px',
              transition: 'all 0.15s ease',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isSidebarCollapsed ? '#dbeafe' : '#f1f5f9';
              e.currentTarget.style.borderColor = '#cbd5e1';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isSidebarCollapsed ? '#eff6ff' : '#ffffff';
              e.currentTarget.style.borderColor = '#e2e8f0';
            }}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        )}

        {/* Breadcrumbs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          <span className="hidden sm:inline" style={{ color: '#64748b', fontWeight: 500 }}>demo</span>
          <ChevronRight size={14} color="#94a3b8" className="hidden sm:inline" />
          <span
            style={{
              color: '#0f172a',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '120px',
            }}
            className="sm:max-w-none"
          >
            {getPageTitle()}
          </span>
        </div>

        {/* Repository context selector pill */}
        {repositories.length > 0 && onSelectRepo && (
          <div className="hidden md:flex" style={{ marginLeft: '12px', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#cbd5e1', fontSize: '12px' }}>|</span>
            <GitBranch size={13} color="#0d9488" />
            <select
              value={selectedRepoId || ''}
              onChange={(e) => onSelectRepo(Number(e.target.value))}
              style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                color: '#0f172a',
                fontSize: '12px',
                fontWeight: 600,
                padding: '4px 8px',
                cursor: 'pointer',
                outline: 'none',
                maxWidth: '180px',
              }}
              aria-label="Filter context by connected repository"
            >
              <option value="" style={{ background: '#ffffff', color: '#64748b' }}>
                All Repositories ({repositories.length})
              </option>
              {repositories.map((repo) => (
                <option key={repo.id} value={repo.id} style={{ background: '#ffffff', color: '#0f172a' }}>
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
              color: '#0f766e',
              background: '#f0fdf4',
              border: '1px solid #a7f3d0',
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
        {/* Cinematic Animated Logo Intro Button (desktop/tablet only) */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('agentguard:replay-intro'))}
          className="hidden md:flex"
          style={{
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            fontWeight: 600,
            color: '#7c3aed',
            background: '#faf5ff',
            border: '1px solid #e9d5ff',
            borderRadius: '6px',
            padding: '5px 11px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          title="Play Cinematic Logo & Cybersecurity Animation"
        >
          <Play size={12} color="#7c3aed" fill="#7c3aed" />
          <span>Play Intro</span>
        </button>

        {/* AI Assistant shortcut */}
        {onOpenAiAssistant && (
          <button
            onClick={onOpenAiAssistant}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#1d4ed8',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '6px',
              padding: '6px 10px',
              cursor: 'pointer',
              minHeight: '36px',
              transition: 'all 0.15s ease',
            }}
            title="Open AI Security Assistant"
          >
            <Sparkles size={13} color="#2563eb" />
            <span className="hidden sm:inline">AI Assistant</span>
          </button>
        )}

        {/* External Docs (desktop only) */}
        <a
          href="/api/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:flex"
          style={{
            color: '#475569',
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
            color: '#475569',
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
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
            }}
          >
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                background: 'linear-gradient(135deg, #2563eb 0%, #0d9488 100%)',
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
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>
                {user.email ? user.email.split('@')[0] : 'User'}
              </div>
              <div style={{ fontSize: '10px', color: '#64748b' }}>Security Auditor</div>
            </div>
            <button
              onClick={() => signOut()}
              title="Sign Out"
              aria-label="Sign Out"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#94a3b8',
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
                background: 'rgba(37, 99, 235, 0.08)',
                border: '1px solid rgba(37, 99, 235, 0.25)',
                color: '#1d4ed8',
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
                  background: '#2563eb',
                  boxShadow: '0 0 6px rgba(37, 99, 235, 0.6)',
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
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  boxShadow: '0 2px 4px rgba(37,99,235,0.2)',
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
