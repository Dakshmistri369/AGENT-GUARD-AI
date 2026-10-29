import React, { useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  AlertTriangle,
  GitBranch,
  History,
  FileText,
  Play,
  Settings,
  Scale,
  Sparkles,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  X,
  Plus,
} from 'lucide-react';
import { AnimatedBrandLogo, type LogoScanState } from '../brand/AnimatedBrandLogo';

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
  collapsed: externalCollapsed,
  onToggleCollapse: externalToggleCollapse,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const location = useLocation();

  const isCollapsed = externalCollapsed !== undefined ? externalCollapsed : internalCollapsed;
  const toggleCollapse = externalToggleCollapse || (() => setInternalCollapsed((c) => !c));
  const isEffectiveCollapsed = !isMobileDrawer && isCollapsed;

  // Sidebar width: 240px expanded / 64px collapsed
  const sidebarWidthClass = isMobileDrawer
    ? 'w-full'
    : isEffectiveCollapsed
    ? 'w-[64px] min-w-[64px]'
    : 'w-[240px] min-w-[240px]';

  return (
    <aside
      aria-label="Main Navigation"
      className={`${sidebarWidthClass} bg-slate-50 border-r border-slate-200 flex flex-col h-full relative z-20 transition-all duration-200 select-none`}
    >
      {/* Brand Header */}
      <div className={`h-14 min-h-[56px] border-b border-slate-200 bg-white flex items-center ${isEffectiveCollapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
        {!isEffectiveCollapsed ? (
          <>
            <Link
              to="/"
              onClick={() => isMobileDrawer && onCloseMobileDrawer?.()}
              className="flex items-center min-w-0 overflow-hidden no-underline text-inherit"
              title="AgentGuard AI Security Command Center"
            >
              <AnimatedBrandLogo
                variant="full"
                size="md"
                scanState={scanState}
                findingsCount={findingsCount}
              />
            </Link>

            {isMobileDrawer && (
              <button
                onClick={onCloseMobileDrawer}
                aria-label="Close navigation"
                className="w-8 h-8 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            )}
          </>
        ) : (
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
            className="flex items-center justify-center no-underline"
            title="Expand sidebar (Ctrl+B)"
          >
            <AnimatedBrandLogo
              variant="icon"
              size="md"
              scanState={scanState}
              findingsCount={findingsCount}
            />
          </Link>
        )}
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4 no-scrollbar">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="space-y-1">
            {!isEffectiveCollapsed ? (
              <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {section.title}
              </div>
            ) : (
              <div className="h-2" />
            )}

            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const fullCurrent = location.pathname + location.search;

                const isActive = item.path.includes('?')
                  ? fullCurrent === item.path
                  : location.pathname === item.path && !location.search.includes('tab=') && !location.search.includes('action=');

                const itemClasses = `h-9 text-sm font-medium rounded-lg flex items-center gap-2.5 transition-colors ${
                  isEffectiveCollapsed ? 'justify-center px-0 w-full' : 'px-2.5'
                } ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-semibold border-l-[3px] border-blue-600 rounded-l-none'
                    : 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900'
                }`;

                if (item.isExternal) {
                  return (
                    <a
                      key={item.label}
                      href={item.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={isEffectiveCollapsed ? item.label : undefined}
                      onClick={() => isMobileDrawer && onCloseMobileDrawer?.()}
                      className={itemClasses}
                    >
                      <Icon size={18} className="shrink-0 text-slate-500" />
                      {!isEffectiveCollapsed && (
                        <span className="truncate">{item.label}</span>
                      )}
                    </a>
                  );
                }

                return (
                  <NavLink
                    key={item.label}
                    to={item.path}
                    title={isEffectiveCollapsed ? item.label : undefined}
                    onClick={() => isMobileDrawer && onCloseMobileDrawer?.()}
                    className={itemClasses}
                  >
                    <Icon
                      size={18}
                      className={`shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-500'}`}
                    />
                    {!isEffectiveCollapsed && (
                      <span className="truncate flex-1">{item.label}</span>
                    )}
                    {item.badge && !isEffectiveCollapsed && (
                      <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
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

      {/* Sidebar Footer with Single Desktop Collapse Toggle */}
      {!isMobileDrawer && (
        <div className={`p-2.5 border-t border-slate-200 bg-white mt-auto ${isEffectiveCollapsed ? 'flex justify-center' : ''}`}>
          {!isEffectiveCollapsed ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 px-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                <span className="font-semibold text-slate-800 text-[11px]">Engines Active</span>
                <span className="text-[10px] text-slate-400">v1.0</span>
              </div>
              <button
                onClick={toggleCollapse}
                title="Collapse sidebar (Ctrl+B)"
                aria-label="Collapse sidebar"
                className="h-8 w-8 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
            </div>
          ) : (
            <button
              onClick={toggleCollapse}
              title="Expand sidebar (Ctrl+B)"
              aria-label="Expand sidebar"
              className="h-9 w-9 rounded-md flex items-center justify-center text-slate-500 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          )}
        </div>
      )}
    </aside>
  );
};
export default Sidebar;
