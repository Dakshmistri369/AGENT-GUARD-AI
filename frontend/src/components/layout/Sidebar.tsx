import React, { useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  AlertTriangle,
  GitBranch,
  History,
  FileText,
  Settings,
  Sparkles,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  X,
  FolderOpen,
} from 'lucide-react';
import { AnimatedBrandLogo, type LogoScanState } from '../brand/AnimatedBrandLogo';
import { API_BASE_URL } from '../../lib/api';

export interface SidebarProps {
  scanState?: LogoScanState;
  findingsCount?: number;
  isMobileDrawer?: boolean;
  onCloseMobileDrawer?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface NavSection {
  title: string;
  items: {
    label: string;
    path: string;
    icon: React.ComponentType<{ size?: number; color?: string; className?: string }>;
    isExternal?: boolean;
    badge?: string;
  }[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'WORKSPACE',
    items: [
      { label: 'Overview', path: '/', icon: LayoutDashboard },
      { label: 'Projects', path: '/projects', icon: FolderOpen },
      { label: 'Repositories', path: '/repositories', icon: GitBranch },
      { label: 'Findings', path: '/repositories?tab=findings', icon: AlertTriangle },
      { label: 'Scans', path: '/repositories?tab=history', icon: History },
      { label: 'Reports', path: '/repositories?tab=solutions', icon: FileText },
    ],
  },
  {
    title: 'TOOLS',
    items: [
      { label: 'AI Assistant', path: '/repositories?tab=ai', icon: Sparkles },
    ],
  },
  {
    title: 'CONFIGURATION',
    items: [
      { label: 'Settings', path: '/settings', icon: Settings },
      { label: 'Help & API Docs', path: `${API_BASE_URL}/docs`, icon: BookOpen, isExternal: true },
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  scanState = 'idle',
  findingsCount = 0,
  isMobileDrawer = false,
  onCloseMobileDrawer,
  collapsed: externalCollapsed,
  onToggleCollapse: externalToggleCollapse,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const location = useLocation();

  const isCollapsed = externalCollapsed !== undefined ? externalCollapsed : internalCollapsed;
  const toggleCollapse = externalToggleCollapse || (() => setInternalCollapsed((c) => !c));
  const isEffectiveCollapsed = !isMobileDrawer && isCollapsed;

  return (
    <aside
      aria-label="Main Navigation"
      style={{
        width: isMobileDrawer ? '100%' : isEffectiveCollapsed ? '68px' : '256px',
        minWidth: isMobileDrawer ? '100%' : isEffectiveCollapsed ? '68px' : '256px',
        maxWidth: isMobileDrawer ? '100%' : undefined,
        background: '#0d0e11',
        borderRight: isMobileDrawer ? 'none' : '1px solid rgba(62, 73, 72, 0.4)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease, min-width 0.2s ease',
        position: 'relative',
        zIndex: 20,
        height: '100%',
      }}
    >
      {/* Brand Header with Animated Logo */}
      <div
        style={{
          padding: isEffectiveCollapsed ? '10px 8px' : '10px 16px',
          borderBottom: '1px solid rgba(62, 73, 72, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isEffectiveCollapsed ? 'center' : 'space-between',
          minHeight: '56px',
          height: '56px',
          background: 'transparent',
          position: 'relative',
        }}
      >
        {!isEffectiveCollapsed ? (
          <Link
            to="/"
            onClick={() => isMobileDrawer && onCloseMobileDrawer?.()}
            style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' }}
            title="AgentGuard AI Security Command Center"
          >
            <AnimatedBrandLogo
              variant="full"
              size="md"
              scanState={scanState}
              findingsCount={findingsCount}
            />
          </Link>
        ) : (
          /* Collapsed state header: icon + bright expand button */
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              gap: '4px',
            }}
          >
            <Link
              to="/"
              onClick={(e) => {
                if (isMobileDrawer) {
                  onCloseMobileDrawer?.();
                } else {
                  e.preventDefault();
                  toggleCollapse();
                }
              }}
              style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}
              title="Click to expand navigation (Ctrl+B)"
            >
              <AnimatedBrandLogo
                variant="icon"
                size="md"
                scanState={scanState}
                findingsCount={findingsCount}
              />
            </Link>
          </div>
        )}

        {isMobileDrawer && (
          <button
            onClick={onCloseMobileDrawer}
            aria-label="Close navigation"
            style={{
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              background: 'rgba(56, 189, 248, 0.1)',
              borderRadius: '8px',
              color: '#94a3b8',
              cursor: 'pointer',
              marginLeft: '8px',
            }}
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Navigation Sections */}
      <nav
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '16px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
      >
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            {/* Section Header (hidden when collapsed) */}
            {!isEffectiveCollapsed && (
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  color: '#889392',
                  letterSpacing: '0.08em',
                  fontFamily: "'JetBrains Mono', monospace",
                  padding: '4px 12px',
                  textTransform: 'uppercase',
                  marginBottom: '4px',
                }}
              >
                {section.title}
              </div>
            )}

            {/* Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {section.items.map((item) => {
                const Icon = item.icon;
                const fullCurrent = location.pathname + location.search;

                // Check active state
                const isActive = item.path.includes('?')
                  ? fullCurrent === item.path
                  : location.pathname === item.path && !location.search.includes('tab=') && !location.search.includes('action=');

                if (item.isExternal) {
                  return (
                    <a
                      key={item.label}
                      href={item.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={isEffectiveCollapsed ? item.label : undefined}
                      onClick={() => isMobileDrawer && onCloseMobileDrawer?.()}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: isEffectiveCollapsed ? 'center' : 'flex-start',
                        gap: isEffectiveCollapsed ? '0' : '12px',
                        padding: isEffectiveCollapsed ? '10px 0' : '9px 12px',
                        minHeight: '38px',
                        height: '38px',
                        borderRadius: '4px',
                        fontSize: '13px',
                        fontWeight: 500,
                        color: '#bdc9c8',
                        textDecoration: 'none',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#1b1b1f';
                        e.currentTarget.style.color = '#e3e2e6';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#bdc9c8';
                      }}
                    >
                      <Icon size={16} color="#889392" className="shrink-0" />
                      {!isEffectiveCollapsed && <span style={{ lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
                    </a>
                  );
                }

                return (
                  <NavLink
                    key={item.label}
                    to={item.path}
                    title={isEffectiveCollapsed ? item.label : undefined}
                    onClick={() => {
                      if (isMobileDrawer) onCloseMobileDrawer?.();
                      if (item.label === 'AI Assistant' || item.label === 'AI Security Assistant') {
                        window.dispatchEvent(new CustomEvent('agentguard:open-ai-assistant'));
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: isEffectiveCollapsed ? 'center' : 'flex-start',
                      gap: isEffectiveCollapsed ? '0' : '12px',
                      padding: isEffectiveCollapsed ? '10px 0' : '9px 12px',
                      minHeight: '38px',
                      height: '38px',
                      borderRadius: '4px',
                      fontSize: '13px',
                      fontWeight: isActive ? 600 : 500,
                      textDecoration: 'none',
                      color: isActive ? '#a7fcfa' : '#bdc9c8',
                      background: isActive ? 'rgba(139, 223, 221, 0.1)' : 'transparent',
                      borderLeft: isEffectiveCollapsed ? 'none' : (isActive ? '2px solid #a7fcfa' : '2px solid transparent'),
                      transition: 'all 0.15s ease',
                      position: 'relative',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = '#1b1b1f';
                        e.currentTarget.style.color = '#e3e2e6';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#bdc9c8';
                      }
                    }}
                  >
                    <Icon size={16} color={isActive ? '#a7fcfa' : '#889392'} className="shrink-0" />
                    {!isEffectiveCollapsed && <span style={{ lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
                    {isActive && !isEffectiveCollapsed && (
                      <span className="pulse-glow-cyan" style={{ marginLeft: 'auto', width: '6px', height: '6px', borderRadius: '50%', background: '#a7fcfa' }} />
                    )}
                    {item.badge && !isEffectiveCollapsed && !isActive && (
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: '10px',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: 'rgba(139, 223, 221, 0.12)',
                          color: '#8bdfdd',
                          fontWeight: 600,
                          border: '1px solid rgba(139, 223, 221, 0.3)',
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer Info Pill & Collapse / Expand Controls */}
      {!isEffectiveCollapsed ? (
        <div
          style={{
            padding: '12px 14px',
            borderTop: '1px solid rgba(62, 73, 72, 0.35)',
            fontSize: '11px',
            color: '#bdc9c8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'transparent',
            marginTop: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              className="pulse-glow-cyan"
              style={{
                display: 'inline-block',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#8bdfdd',
                boxShadow: '0 0 8px rgba(139, 223, 221, 0.6)',
              }}
            />
            <span style={{ color: '#e3e2e6', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>Engines Active</span>
            <span style={{ color: '#889392', fontSize: '10px', marginLeft: '2px', fontFamily: "'JetBrains Mono', monospace" }}>v1.0.0</span>
          </div>
          {!isMobileDrawer && (
            <button
              onClick={toggleCollapse}
              title="Collapse sidebar (Ctrl+B)"
              aria-label="Collapse sidebar"
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '4px',
                border: 'none',
                background: 'transparent',
                color: '#889392',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#a7fcfa';
                e.currentTarget.style.background = '#1b1b1f';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#889392';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <ChevronLeft size={14} />
            </button>
          )}
        </div>
      ) : (
        !isMobileDrawer && (
          <div
            style={{
              padding: '10px 8px',
              borderTop: '1px solid rgba(62, 73, 72, 0.35)',
              display: 'flex',
              justifyContent: 'center',
              background: 'transparent',
              marginTop: 'auto',
            }}
          >
            <button
              onClick={toggleCollapse}
              title="Expand sidebar (Ctrl+B)"
              aria-label="Expand sidebar"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '4px',
                background: '#1b1b1f',
                border: '1px solid rgba(62, 73, 72, 0.5)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#bdc9c8',
                boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#292a2d';
                e.currentTarget.style.color = '#a7fcfa';
                e.currentTarget.style.borderColor = 'rgba(139, 223, 221, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#1b1b1f';
                e.currentTarget.style.color = '#bdc9c8';
                e.currentTarget.style.borderColor = 'rgba(62, 73, 72, 0.5)';
              }}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )
      )}
    </aside>
  );
};
