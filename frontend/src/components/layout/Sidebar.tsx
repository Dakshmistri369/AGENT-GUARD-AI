import React, { useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  AlertTriangle,
  GitBranch,
  History,
  FileText,
  Plus,
  Play,
  Settings,
  Scale,
  Sparkles,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  X,
} from 'lucide-react';
import { AnimatedBrandLogo, type LogoScanState } from '../brand/AnimatedBrandLogo';

export interface SidebarProps {
  scanState?: LogoScanState;
  findingsCount?: number;
  isMobileDrawer?: boolean;
  onCloseMobileDrawer?: () => void;
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
    title: 'GENERAL',
    items: [
      { label: 'Dashboard', path: '/', icon: LayoutDashboard },
      { label: 'Issues', path: '/repositories?tab=findings', icon: AlertTriangle },
      { label: 'Repositories', path: '/repositories', icon: GitBranch },
      { label: 'Scans', path: '/repositories?tab=history', icon: History },
      { label: 'Reports', path: '/repositories?tab=solutions', icon: FileText },
    ],
  },
  {
    title: 'QUICK ACTIONS',
    items: [
      { label: 'Start Scan', path: '/repositories?action=scan', icon: Play },
      { label: 'New Repo', path: '/repositories?action=new', icon: Plus },
    ],
  },
  {
    title: 'CONFIG',
    items: [
      { label: 'General / Settings', path: '/settings', icon: Settings },
      { label: 'Scan Comparison', path: '/repositories?tab=matrix', icon: Scale },
      { label: 'AI Security Assistant', path: '/repositories?tab=ai', icon: Sparkles },
      { label: 'Projects', path: '/projects', icon: FolderOpen },
      { label: 'API Docs', path: '/api/docs', icon: BookOpen, isExternal: true },
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  scanState = 'idle',
  findingsCount = 0,
  isMobileDrawer = false,
  onCloseMobileDrawer,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const isEffectiveCollapsed = !isMobileDrawer && collapsed;

  return (
    <aside
      aria-label="Main Navigation"
      style={{
        width: isMobileDrawer ? '100%' : isEffectiveCollapsed ? '68px' : '230px',
        minWidth: isMobileDrawer ? '100%' : isEffectiveCollapsed ? '68px' : '230px',
        maxWidth: isMobileDrawer ? '100%' : undefined,
        background: '#f8fafc',
        borderRight: isMobileDrawer ? 'none' : '1px solid #e2e8f0',
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
          padding: isEffectiveCollapsed ? '16px 12px' : '16px 16px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isEffectiveCollapsed ? 'center' : 'space-between',
          minHeight: '64px',
          background: '#ffffff',
        }}
      >
        <Link
          to="/"
          onClick={() => isMobileDrawer && onCloseMobileDrawer?.()}
          style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}
          title="AgentGuard AI Security Command Center"
        >
          <AnimatedBrandLogo
            variant={isEffectiveCollapsed ? 'icon' : 'full'}
            size="md"
            scanState={scanState}
            findingsCount={findingsCount}
          />
        </Link>

        {isMobileDrawer && (
          <button
            onClick={onCloseMobileDrawer}
            aria-label="Close navigation"
            style={{
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              background: '#f1f5f9',
              borderRadius: '8px',
              color: '#334155',
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
                        gap: '10px',
                        padding: '10px 12px',
                        minHeight: '42px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: 500,
                        color: '#334155',
                        textDecoration: 'none',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#f1f5f9';
                        e.currentTarget.style.color = '#0f172a';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#334155';
                      }}
                    >
                      <Icon size={16} color="#64748b" />
                      {!isEffectiveCollapsed && <span>{item.label}</span>}
                    </a>
                  );
                }

                return (
                  <NavLink
                    key={item.label}
                    to={item.path}
                    title={isEffectiveCollapsed ? item.label : undefined}
                    onClick={() => isMobileDrawer && onCloseMobileDrawer?.()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 12px',
                      minHeight: '42px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: isActive ? 700 : 500,
                      textDecoration: 'none',
                      color: isActive ? '#1d4ed8' : '#0f172a',
                      background: isActive ? '#eff6ff' : 'transparent',
                      borderLeft: isActive ? '3px solid #2563eb' : '3px solid transparent',
                      transition: 'all 0.15s ease',
                      position: 'relative',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = '#f1f5f9';
                        e.currentTarget.style.color = '#000000';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#0f172a';
                      }
                    }}
                  >
                    <Icon size={16} color={isActive ? '#2563eb' : '#64748b'} />
                    {!isEffectiveCollapsed && <span>{item.label}</span>}
                    {item.badge && !isEffectiveCollapsed && (
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: '10px',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: '#f0fdf4',
                          color: '#059669',
                          fontWeight: 600,
                          border: '1px solid #bbf7d0',
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

      {/* Collapse / Expand Toggle Button (desktop only) */}
      {!isMobileDrawer && (
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{
            position: 'absolute',
            right: '-11px',
            top: '72px',
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#475569',
            zIndex: 30,
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      )}

      {/* Footer Info Pill */}
      {!isEffectiveCollapsed && (
        <div
          style={{
            padding: '12px 14px',
            borderTop: '1px solid #e2e8f0',
            fontSize: '11px',
            color: '#64748b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                display: 'inline-block',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#059669',
              }}
            />
            <span style={{ color: '#0f172a', fontWeight: 600 }}>Engines Active</span>
          </div>
          <span style={{ color: '#64748b', fontSize: '10px' }}>v1.0.0</span>
        </div>
      )}
    </aside>
  );
};
