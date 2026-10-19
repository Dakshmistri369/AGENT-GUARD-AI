import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Sparkles,
  Settings,
  ChevronRight,
  GitBranch,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import type { Repository } from '../../types';

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
        background: '#071224',
        borderBottom: '1px solid rgba(30, 58, 110, 0.45)',
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
        <ChevronRight size={14} color="#475569" />
        <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{getPageTitle()}</span>

        {/* Repository context selector pill */}
        {repositories.length > 0 && onSelectRepo && (
          <div style={{ marginLeft: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#475569', fontSize: '12px' }}>|</span>
            <GitBranch size={13} color="#2dd4bf" />
            <select
              value={selectedRepoId || ''}
              onChange={(e) => onSelectRepo(Number(e.target.value))}
              style={{
                background: 'rgba(15, 32, 64, 0.6)',
                border: '1px solid rgba(30, 58, 110, 0.5)',
                borderRadius: '6px',
                color: '#2dd4bf',
                fontSize: '12px',
                fontWeight: 600,
                padding: '3px 8px',
                cursor: 'pointer',
                outline: 'none',
              }}
              aria-label="Filter context by connected repository"
            >
              <option value="" style={{ background: '#071426', color: '#94a3b8' }}>
                All Repositories ({repositories.length})
              </option>
              {repositories.map((repo) => (
                <option key={repo.id} value={repo.id} style={{ background: '#071426', color: '#f1f5f9' }}>
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
              color: '#2dd4bf',
              background: 'rgba(20, 184, 166, 0.15)',
              border: '1px solid rgba(45, 212, 191, 0.35)',
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
              color: '#e2e8f0',
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '6px',
              padding: '5px 10px',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
            title="Open AI Security Assistant"
          >
            <Sparkles size={13} color="#60a5fa" />
            <span>AI Assistant</span>
          </button>
        )}

        {/* External Docs */}
        <a
          href="/api/docs"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#94a3b8',
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
            color: '#94a3b8',
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

        {/* User Pill matching screenshot */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 10px',
            borderRadius: '8px',
            background: 'rgba(15, 32, 64, 0.5)',
            border: '1px solid rgba(30, 58, 110, 0.4)',
          }}
        >
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, #1d4ed8 0%, #0d9488 100%)',
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
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9' }}>demo</div>
            <div style={{ fontSize: '10px', color: '#64748b' }}>Security Auditor</div>
          </div>
        </div>
      </div>
    </header>
  );
};
