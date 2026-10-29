import React, { useState, useRef, useEffect } from 'react';
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
  MoreHorizontal,
  BookOpen,
} from 'lucide-react';
import type { Repository } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { SHOW_SIGN_IN_BUTTON } from '../../config/authFeatures';
import { BackgroundScanIndicator } from '../scans/BackgroundScanIndicator';

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
}) => {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Close more menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    if (isMoreMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMoreMenuOpen]);

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

  const selectedRepo = repositories.find((r) => r.id === selectedRepoId);

  return (
    <header className="h-14 min-h-[56px] bg-white border-b border-slate-200 flex items-center justify-between px-3 sm:px-4 lg:px-6 sticky top-0 z-30 pt-safe">
      {/* Left: Mobile hamburger, Breadcrumbs & Repo selector */}
      <div className="flex items-center gap-2 text-sm min-w-0">
        {onToggleMobileNav && (
          <button
            onClick={onToggleMobileNav}
            aria-label="Open mobile navigation"
            className="lg:hidden w-9 h-9 rounded-md flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
          >
            <Menu size={20} />
          </button>
        )}

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1.5 min-w-0 text-sm">
          <span className="hidden sm:inline text-slate-400 font-medium text-xs">demo</span>
          <ChevronRight size={14} className="hidden sm:inline text-slate-300 shrink-0" />
          <span className="font-semibold text-slate-900 truncate max-w-[8rem] sm:max-w-[12rem]">
            {getPageTitle()}
          </span>

          {selectedRepo && (
            <>
              <ChevronRight size={14} className="text-slate-300 shrink-0" />
              <span
                className="font-medium text-slate-600 truncate max-w-[10rem] sm:max-w-[16rem]"
                title={selectedRepo.full_name}
              >
                {selectedRepo.full_name}
              </span>
            </>
          )}
        </div>

        {/* Repository context selector dropdown */}
        {repositories.length > 0 && onSelectRepo && (
          <div className="hidden md:flex items-center gap-1.5 ml-2 pl-2 border-l border-slate-200">
            <GitBranch size={13} className="text-teal-600 shrink-0" />
            <select
              value={selectedRepoId || ''}
              onChange={(e) => onSelectRepo(Number(e.target.value))}
              className="bg-slate-50 border border-slate-300 text-slate-800 text-xs font-medium rounded-md px-2 py-1 cursor-pointer outline-none max-w-[160px] truncate"
              aria-label="Filter context by connected repository"
            >
              <option value="" className="text-slate-500">
                All Repositories ({repositories.length})
              </option>
              {repositories.map((repo) => (
                <option key={repo.id} value={repo.id} className="text-slate-900">
                  {repo.full_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Live scanning indicator */}
        {isScanning && (
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full shrink-0">
            <RefreshCw size={11} className="animate-spin text-teal-600" />
            <span className="truncate max-w-[12rem]">
              Auditing {activeScanRepoName || 'Repository'}…
            </span>
          </div>
        )}
      </div>

      {/* Right: Quick actions, Active Scans indicator, AI Assistant, User chip */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Background Scan Activity Indicator */}
        <BackgroundScanIndicator />

        {/* AI Assistant shortcut */}
        {onOpenAiAssistant && (
          <button
            onClick={onOpenAiAssistant}
            className="h-9 px-2.5 sm:px-3 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md flex items-center gap-1.5 transition-colors"
            title="Open AI Security Assistant"
          >
            <Sparkles size={14} className="text-blue-600" />
            <span className="hidden sm:inline">AI Assistant</span>
          </button>
        )}

        {/* Settings shortcut */}
        <Link
          to="/settings"
          className="w-9 h-9 rounded-md flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          title="Settings & Configurations"
        >
          <Settings size={17} />
        </Link>

        {/* Overflow Menu: Play Intro & External Documentation */}
        <div className="relative" ref={moreMenuRef}>
          <button
            onClick={() => setIsMoreMenuOpen((prev) => !prev)}
            aria-label="More actions"
            aria-expanded={isMoreMenuOpen}
            className="w-9 h-9 rounded-md flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="More Options"
          >
            <MoreHorizontal size={18} />
          </button>

          {isMoreMenuOpen && (
            <div className="absolute right-0 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 animate-slide-in">
              <button
                onClick={() => {
                  setIsMoreMenuOpen(false);
                  window.dispatchEvent(new CustomEvent('agentguard:replay-intro'));
                }}
                className="w-full text-left px-3 py-2 text-xs text-purple-700 hover:bg-purple-50 flex items-center gap-2 font-medium"
              >
                <Play size={13} className="text-purple-600 fill-purple-600" />
                Play Intro Animation
              </button>
              <a
                href="/api/docs"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsMoreMenuOpen(false)}
                className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium no-underline"
              >
                <BookOpen size={13} className="text-slate-500" />
                Swagger API Docs
                <ExternalLink size={11} className="ml-auto text-slate-400" />
              </a>
            </div>
          )}
        </div>

        {/* User Chip */}
        {user ? (
          <div className="flex items-center gap-1.5 p-1 pr-2 rounded-lg bg-slate-50 border border-slate-200">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-600 to-teal-600 flex items-center justify-center text-white text-[11px] font-bold uppercase">
              {user.email ? user.email[0] : 'U'}
            </div>
            <div className="hidden md:block leading-tight">
              <div className="text-xs font-semibold text-slate-900 truncate max-w-[6rem]">
                {user.email ? user.email.split('@')[0] : 'User'}
              </div>
            </div>
            <button
              onClick={() => signOut()}
              title="Sign Out"
              aria-label="Sign Out"
              className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
            >
              <LogOut size={13} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold"
              title="AgentGuard AI is running in Demo Mode"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
              Demo
            </div>
            {SHOW_SIGN_IN_BUTTON && (
              <Link
                to="/login"
                className="h-8 px-2.5 rounded-md bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white text-xs font-medium flex items-center shadow-xs no-underline"
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
export default TopNavigation;
