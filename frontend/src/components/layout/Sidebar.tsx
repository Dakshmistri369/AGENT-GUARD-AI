import React, { useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderOpen,
  Plus,
  AlertTriangle,
  Shield,
  FileCheck,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
  GitBranch,
} from 'lucide-react';

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  implemented: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Overview',         path: '/',                         icon: LayoutDashboard, implemented: true  },
  { label: 'GitHub Repos',     path: '/repositories',             icon: GitBranch,       implemented: true  },
  { label: 'Projects',         path: '/projects',                 icon: FolderOpen,      implemented: true  },
  { label: 'New Audit',        path: '/repositories?action=new',  icon: Plus,            implemented: true  },
  { label: 'Findings',         path: '/repositories?tab=findings', icon: AlertTriangle,  implemented: true  },
  { label: 'Scan History',     path: '/repositories?tab=history',  icon: History,        implemented: true  },
  { label: 'Security Gateway', path: '/gateway',                  icon: Shield,          implemented: false },
  { label: 'Policies',         path: '/policies',                 icon: FileCheck,       implemented: false },
  { label: 'Settings',         path: '/settings',                 icon: Settings,        implemented: true  },
];

export const Sidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <aside
      style={{
        width: collapsed ? '64px' : '220px',
        minWidth: collapsed ? '64px' : '220px',
        background: 'linear-gradient(180deg, #0a1628 0%, #050d1a 100%)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease, min-width 0.2s ease',
        position: 'relative',
        zIndex: 10,
      }}
    >
      {/* Logo */}
      <Link
        to="/"
        style={{
          padding: collapsed ? '18px 14px' : '18px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          overflow: 'hidden',
          textDecoration: 'none',
          cursor: 'pointer',
        }}
        title="AgentGuard AI"
      >
        <div style={{
          width: '34px',
          height: '34px',
          borderRadius: '9px',
          overflow: 'hidden',
          flexShrink: 0,
          background: '#040d1a',
          border: '1px solid rgba(45, 212, 191, 0.35)',
          boxShadow: '0 0 14px rgba(20, 184, 166, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <img
            src="/logo-icon.png"
            alt="AgentGuard AI Logo"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>
        {!collapsed && (
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: '14px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              lineHeight: 1.2,
              letterSpacing: '-0.2px',
              whiteSpace: 'nowrap',
            }}>
              AgentGuard <span style={{ color: 'var(--teal-bright)' }}>AI</span>
            </div>
            <div style={{
              fontSize: '9.5px',
              color: 'var(--teal)',
              fontWeight: 600,
              letterSpacing: '0.6px',
              whiteSpace: 'nowrap',
              textTransform: 'uppercase',
            }}>
              Security Auditor
            </div>
          </div>
        )}
      </Link>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const fullPath = location.pathname + location.search;
          const isActive = item.path.includes('?')
            ? fullPath === item.path
            : location.pathname === item.path && !location.search.includes('tab=') && !location.search.includes('action=');
          const isDisabled = !item.implemented;

          if (isDisabled) {
            return (
              <div
                key={item.path}
                title={collapsed ? `${item.label} (coming soon)` : 'Coming soon'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 10px',
                  borderRadius: '8px',
                  opacity: 0.35,
                  cursor: 'not-allowed',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon size={16} />
                {!collapsed && <span>{item.label}</span>}
                {!collapsed && (
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: '9px',
                    background: 'rgba(148,163,184,0.1)',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    color: 'var(--text-muted)',
                  }}>
                    SOON
                  </span>
                )}
              </div>
            );
          }

          return (
            <NavLink
              key={item.path}
              to={item.path}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '9px 10px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 500,
                textDecoration: 'none',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                transition: 'background 0.15s, color 0.15s',
                background: isActive ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: isActive ? 'var(--electric-blue-bright)' : 'var(--text-secondary)',
                borderLeft: isActive ? '2px solid var(--electric-blue)' : '2px solid transparent',
              }}
            >
              <Icon size={16} />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          position: 'absolute',
          right: '-12px',
          top: '72px',
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          background: 'var(--navy-700)',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary)',
          zIndex: 20,
        }}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* Footer */}
      {!collapsed && (
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          fontSize: '10px',
          color: 'var(--text-muted)',
          lineHeight: 1.5,
        }}>
          <div style={{ color: 'var(--accent-amber)', fontWeight: 600, marginBottom: '2px' }}>
            ⚠ DEMO MODE
          </div>
          <div>No real auth active</div>
          <div>AI: Mock Provider</div>
        </div>
      )}
    </aside>
  );
};
