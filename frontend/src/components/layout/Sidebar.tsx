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
} from 'lucide-react';
import { AnimatedBrandLogo, type LogoScanState } from '../brand/AnimatedBrandLogo';

export interface SidebarProps {
  scanState?: LogoScanState;
  findingsCount?: number;
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
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <aside
      style={{
        width: collapsed ? '68px' : '230px',
        minWidth: collapsed ? '68px' : '230px',
        background: '#07101f',
        borderRight: '1px solid rgba(30, 58, 110, 0.45)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease, min-width 0.2s ease',
        position: 'relative',
        zIndex: 20,
        height: '100vh',
      }}
    >
      {/* Brand Header with Animated Logo */}
      <div
        style={{
          padding: collapsed ? '16px 12px' : '16px 16px',
          borderBottom: '1px solid rgba(30, 58, 110, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          minHeight: '64px',
        }}
      >
        <Link to="/" style={{ textDecoration: 'none' }} title="AgentGuard AI Security Command Center">
          <AnimatedBrandLogo
            variant={collapsed ? 'icon' : 'full'}
            size="md"
            scanState={scanState}
            findingsCount={findingsCount}
          />
        </Link>
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
            {!collapsed && (
              <div
                style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  color: '#475569',
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
                      title={collapsed ? item.label : undefined}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: 500,
                        color: '#94a3b8',
                        textDecoration: 'none',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(30, 58, 110, 0.25)';
                        e.currentTarget.style.color = '#f1f5f9';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#94a3b8';
                      }}
                    >
                      <Icon size={16} color="#64748b" />
                      {!collapsed && <span>{item.label}</span>}
                    </a>
                  );
                }

                return (
                  <NavLink
                    key={item.label}
                    to={item.path}
                    title={collapsed ? item.label : undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: isActive ? 600 : 500,
                      textDecoration: 'none',
                      color: isActive ? '#f8fafc' : '#94a3b8',
                      background: isActive ? 'rgba(59, 130, 246, 0.18)' : 'transparent',
                      borderLeft: isActive ? '2px solid #3b82f6' : '2px solid transparent',
                      transition: 'all 0.15s ease',
                      position: 'relative',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'rgba(30, 58, 110, 0.2)';
                        e.currentTarget.style.color = '#f1f5f9';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#94a3b8';
                      }
                    }}
                  >
                    <Icon size={16} color={isActive ? '#60a5fa' : '#64748b'} />
                    {!collapsed && <span>{item.label}</span>}
                    {item.badge && !collapsed && (
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: '10px',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: 'rgba(45, 212, 191, 0.15)',
                          color: '#2dd4bf',
                          fontWeight: 600,
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

      {/* Collapse / Expand Toggle Button */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        style={{
          position: 'absolute',
          right: '-11px',
          top: '72px',
          width: '22px',
          height: '22px',
          borderRadius: '50%',
          background: '#0f2040',
          border: '1px solid rgba(59, 130, 246, 0.4)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#94a3b8',
          zIndex: 30,
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        }}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* Footer Info Pill */}
      {!collapsed && (
        <div
          style={{
            padding: '12px 14px',
            borderTop: '1px solid rgba(30, 58, 110, 0.45)',
            fontSize: '11px',
            color: '#64748b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
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
              }}
            />
            <span style={{ color: '#94a3b8', fontWeight: 500 }}>Engines Active</span>
          </div>
          <span style={{ color: '#475569', fontSize: '10px' }}>v1.0.0</span>
        </div>
      )}
    </aside>
  );
};
