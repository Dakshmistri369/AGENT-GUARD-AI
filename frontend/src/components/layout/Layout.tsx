import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopNavigation } from './TopNavigation';
import { AiAssistantDrawer } from '../ai/AiAssistantDrawer';
import { CyberScanBackground } from '../brand/CyberScanBackground';
import { LiveScanRadarModal } from '../brand/LiveScanRadarModal';
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
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState<boolean>(false);
  const [isRadarModalOpen, setIsRadarModalOpen] = useState<boolean>(false);
  const [radarModalData, setRadarModalData] = useState<{
    repoName?: string | null;
    branch?: string | null;
    commitSha?: string | null;
  }>({});

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
    setIsAiAssistantOpen(true);
  };

  useEffect(() => {
    const handleOpen = () => setIsAiAssistantOpen(true);
    window.addEventListener('agentguard:open-ai-assistant', handleOpen);
    return () => window.removeEventListener('agentguard:open-ai-assistant', handleOpen);
  }, []);

  useEffect(() => {
    const handleOpenRadar = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setRadarModalData(detail);
      setIsRadarModalOpen(true);
    };
    window.addEventListener('agentguard:open-cyber-radar', handleOpenRadar);
    return () => window.removeEventListener('agentguard:open-cyber-radar', handleOpenRadar);
  }, []);

  return (
    <div
      className="tactical-grid-bg"
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: '#0d0e11',
        position: 'relative',
      }}
    >
      {/* Dynamic Cyber Video Background (with hardware acceleration & idle pause) */}
      <CyberScanBackground opacity={0.14} />

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
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs transition-opacity"
            aria-hidden="true"
          />

          {/* Slide-over Drawer with Safe-area padding */}
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] h-full bg-[#0d0e11] border-r border-[rgba(62,73,72,0.4)] shadow-2xl flex flex-col z-10 animate-slide-in pt-safe pb-safe">
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

        {/* Content View with seamless dark cyber transparency */}
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            background: 'transparent',
            position: 'relative',
          }}
        >
          <Outlet />
        </main>
      </div>

      {/* Interactive AI Security Assistant Drawer */}
      <AiAssistantDrawer
        isOpen={isAiAssistantOpen}
        onClose={() => setIsAiAssistantOpen(false)}
        activeRepoName={
          repositories.find((r) => r.id === selectedRepoId)?.full_name ||
          repositories[0]?.full_name ||
          null
        }
        activeRepoId={
          repositories.find((r) => r.id === selectedRepoId)?.id ||
          repositories[0]?.id ||
          null
        }
      />

      {/* Interactive Live Cyber Scan Radar Visualizer Modal */}
      <LiveScanRadarModal
        isOpen={isRadarModalOpen}
        onClose={() => setIsRadarModalOpen(false)}
        repoName={
          radarModalData.repoName ||
          repositories.find((r) => r.id === selectedRepoId)?.full_name ||
          activeScanRepoName ||
          'Active Repository'
        }
        branch={radarModalData.branch || 'main'}
        commitSha={radarModalData.commitSha || 'HEAD'}
      />
    </div>
  );
};
