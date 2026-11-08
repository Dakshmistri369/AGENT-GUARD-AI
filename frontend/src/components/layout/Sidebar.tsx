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
        background: 'rgba(6, 11, 20, 0.95)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRight: isMobileDrawer ? 'none' : '1px solid rgba(56, 189, 248, 0.18)',
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
          borderBottom: '1px solid rgba(56, 189, 248, 0.18)',
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
                  fontSize: '10.5px',
                  fontWeight: 700,
                  color: '#64748b',
                  letterSpacing: '0.8px',
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
                        padding: isEffectiveCollapsed ? '10px 0' : '10px 14px',
                        minHeight: '40px',
                        height: '40px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: 500,
                        color: '#94a3b8',
                        textDecoration: 'none',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(56, 189, 248, 0.08)';
                        e.currentTarget.style.color = '#f8fafc';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#94a3b8';
                      }}
                    >
                      <Icon size={16} color="#64748b" className="shrink-0" />
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
                      padding: isEffectiveCollapsed ? '10px 0' : '10px 14px',
                      minHeight: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: isActive ? 700 : 500,
                      textDecoration: 'none',
                      color: isActive ? '#00f0ff' : '#94a3b8',
                      background: isActive ? 'rgba(0, 240, 255, 0.12)' : 'transparent',
                      borderLeft: isEffectiveCollapsed ? 'none' : (isActive ? '3px solid #00f0ff' : '3px solid transparent'),
                      transition: 'all 0.15s ease',
                      position: 'relative',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'rgba(56, 189, 248, 0.08)';
                        e.currentTarget.style.color = '#f8fafc';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#94a3b8';
                      }
                    }}
                  >
                    <Icon size={16} color={isActive ? '#00f0ff' : '#64748b'} className="shrink-0" />
                    {!isEffectiveCollapsed && <span style={{ lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
                    {item.badge && !isEffectiveCollapsed && (
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: '10px',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#34d399',
                          fontWeight: 600,
                          border: '1px solid rgba(16, 185, 129, 0.35)',
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
            borderTop: '1px solid rgba(56, 189, 248, 0.18)',
            fontSize: '11px',
            color: '#64748b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'transparent',
            marginTop: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                display: 'inline-block',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#10b981',
                boxShadow: '0 0 8px #10b981',
              }}
            />
            <span style={{ color: '#f8fafc', fontWeight: 600 }}>Engines Active</span>
            <span style={{ color: '#64748b', fontSize: '10px', marginLeft: '2px' }}>v1.0.0</span>
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
                color: '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#00f0ff';
                e.currentTarget.style.background = 'rgba(56, 189, 248, 0.12)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#64748b';
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
              borderTop: '1px solid rgba(56, 189, 248, 0.18)',
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
                borderRadius: '8px',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(56, 189, 248, 0.22)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94a3b8',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(30, 41, 59, 0.9)';
                e.currentTarget.style.color = '#00f0ff';
                e.currentTarget.style.borderColor = 'rgba(0, 240, 255, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(15, 23, 42, 0.8)';
                e.currentTarget.style.color = '#94a3b8';
                e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.22)';
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
