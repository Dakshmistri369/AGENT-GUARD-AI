import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useSearchParams } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopNavigation } from './TopNavigation';
import { api } from '../../lib/api';
import type { Repository } from '../../types';
import type { LogoScanState } from '../brand/AnimatedBrandLogo';

export const Layout: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
  const [scanState, setScanState] = useState<LogoScanState>('idle');
  const [activeScanRepoName, setActiveScanRepoName] = useState<string | null>(null);

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
      {/* Sidebar with Animated Brand Logo */}
      <Sidebar scanState={scanState} />

      {/* Main Container */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Top Navigation Bar matching screenshot */}
        <TopNavigation
          repositories={repositories}
          selectedRepoId={selectedRepoId}
          onSelectRepo={handleSelectRepo}
          isScanning={scanState === 'scanning'}
          activeScanRepoName={activeScanRepoName}
          onOpenAiAssistant={handleOpenAiAssistant}
        />

        {/* Content View */}
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            background: '#ffffff',
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
};
