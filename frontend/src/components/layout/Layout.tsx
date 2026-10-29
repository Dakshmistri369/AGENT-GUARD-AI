import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopNavigation } from './TopNavigation';
import { api } from '../../lib/api';
import type { Repository } from '../../types';
import type { LogoScanState } from '../brand/AnimatedBrandLogo';

export const Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
  const [scanState, setScanState] = useState<LogoScanState>('idle');
  const [activeScanRepoName, setActiveScanRepoName] = useState<string | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState<boolean>(false);

  // Desktop sidebar collapsed state with localStorage persistence
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('agentguard_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('agentguard_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  // Keyboard shortcut Ctrl+B or Cmd+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        handleToggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close mobile nav on route or search param change
  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [location.pathname, location.search]);

  // Close mobile nav on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileNavOpen(false);
      }
    };
    if (isMobileNavOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileNavOpen]);

  useEffect(() => {
    api.repositories
      .list()
      .then(async (res) => {
        setRepositories(res.items);
        const repoIdParam = searchParams.get('repoId');
        if (repoIdParam) {
          setSelectedRepoId(Number(repoIdParam));
        }

        // Check if any recent scan is currently running
        for (const repo of res.items.slice(0, 5)) {
          try {
            const scans = await api.scans.listByRepo(repo.id);
            if (scans.length > 0 && scans[0].status === 'running') {
              setScanState('scanning');
              setActiveScanRepoName(repo.full_name);
              return;
            }
          } catch {
            // ignore
          }
        }
        setScanState('idle');
        setActiveScanRepoName(null);
      })
      .catch((err) => {
        console.warn('Could not load repositories for top navigation:', err);
      });
  }, [searchParams]);

  const handleSelectRepo = (repoId: number) => {
    setSelectedRepoId(repoId ? repoId : null);
    if (repoId) {
      navigate(`/repositories?repoId=${repoId}`);
    } else {
      navigate('/repositories');
    }
  };

  const handleOpenAiAssistant = () => {
    navigate('/repositories?tab=ai');
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f8fafc' }}>
      {/* Permanent Desktop Sidebar (Hidden below lg breakpoint) */}
      <div className="hidden lg:flex">
        <Sidebar
          scanState={scanState}
          collapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
        />
      </div>

      {/* Accessible Mobile Slide-over Drawer (Visible on < lg screens) */}
      {isMobileNavOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation Drawer"
          className="fixed inset-0 z-50 lg:hidden"
        >
          {/* Backdrop */}
          <div
            onClick={() => setIsMobileNavOpen(false)}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            aria-hidden="true"
          />

          {/* Slide-over Drawer with Safe-area padding */}
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] h-full bg-[#f8fafc] shadow-2xl flex flex-col z-10 animate-slide-in pt-safe pb-safe">
            <Sidebar
              isMobileDrawer
              onCloseMobileDrawer={() => setIsMobileNavOpen(false)}
              scanState={scanState}
            />
          </div>
        </div>
      )}

      {/* Main Container */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Top Navigation Bar with Mobile Hamburger and Desktop Sidebar Toggle */}
        <TopNavigation
          repositories={repositories}
          selectedRepoId={selectedRepoId}
          onSelectRepo={handleSelectRepo}
          isScanning={scanState === 'scanning'}
          activeScanRepoName={activeScanRepoName}
          onOpenAiAssistant={handleOpenAiAssistant}
          onToggleMobileNav={() => setIsMobileNavOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={handleToggleSidebar}
        />

        {/* Content View */}
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            background: '#ffffff',
            position: 'relative',
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
};
