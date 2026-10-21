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
} from 'lucide-react';
import type { Repository } from '../../types';
import { useAuth } from '../../context/AuthContext';

export interface TopNavigationProps {
  repositories?: Repository[];
  selectedRepoId?: number | null;
  onSelectRepo?: (repoId: number) => void;
  isScanning?: boolean;
  activeScanRepoName?: string | null;
  onOpenAiAssistant?: () => void;
}

export const TopNavigation: React.FC<TopNavigationProps> = ({
  repositories = [],
  selectedRepoId,
  onSelectRepo,
  isScanning = false,
  activeScanRepoName,
  onOpenAiAssistant,
}) => {
  const location = useLocation();
  const { user, signOut, isConfigured } = useAuth();

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
      style={{
        height: '56px',
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 30,
      }}
    >
      {/* Left: Breadcrumbs & Active Repository context */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
        <span style={{ color: '#64748b', fontWeight: 500 }}>demo</span>
        <ChevronRight size={14} color="#94a3b8" />
        <span style={{ color: '#0f172a', fontWeight: 700 }}>{getPageTitle()}</span>

        {/* Repository context selector pill */}
        {repositories.length > 0 && onSelectRepo && (
          <div style={{ marginLeft: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
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
              marginLeft: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              fontWeight: 600,
              color: '#0f766e',
              background: '#f0fdf4',
              border: '1px solid #a7f3d0',
              padding: '2px 10px',
              borderRadius: '9999px',
            }}
          >
            <RefreshCw size={11} className="animate-spin" />
            <span>Auditing {activeScanRepoName || 'Repository'}…</span>
          </div>
        )}
      </div>

      {/* Right: Quick actions, AI assistant, user pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Cinematic Animated Logo Intro Button */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('agentguard:replay-intro'))}
          style={{
            display: 'flex',
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
              gap: '6px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#1d4ed8',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '6px',
              padding: '5px 12px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Open AI Security Assistant"
          >
            <Sparkles size={13} color="#2563eb" />
            <span>AI Assistant</span>
          </button>
        )}

        {/* External Docs */}
        <a
          href="/api/docs"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#475569',
            display: 'flex',
            alignItems: 'center',
            padding: '6px',
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
            padding: '6px',
            borderRadius: '6px',
            textDecoration: 'none',
          }}
          title="Settings & Configurations"
        >
          <Settings size={15} />
        </Link>

        {/* User Pill dynamic */}
        {user ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 10px',
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
            <div style={{ lineHeight: 1.1 }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>
                {user.email ? user.email.split('@')[0] : 'User'}
              </div>
              <div style={{ fontSize: '10px', color: '#64748b' }}>Security Auditor</div>
            </div>
            <button
              onClick={() => signOut()}
              title="Sign Out"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#94a3b8',
                padding: '2px',
                marginLeft: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
            >
              <LogOut size={13} />
            </button>
          </div>
        ) : isConfigured ? (
          <Link
            to="/login"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              borderRadius: '6px',
              background: '#2563eb',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Sign In
          </Link>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 10px',
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
              }}
            >
              D
            </div>
            <div style={{ lineHeight: 1.1 }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>demo</div>
              <div style={{ fontSize: '10px', color: '#64748b' }}>Demo Mode</div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
