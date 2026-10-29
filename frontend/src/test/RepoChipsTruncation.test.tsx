import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GitBranch } from 'lucide-react';
import type { Repository, ActiveScanItem } from '../types';

interface RepoChipsListProps {
  repositories: Repository[];
  selectedRepoId: number | null;
  activeScans: ActiveScanItem[];
  onSelect: (repo: Repository) => void;
}

const RepoChipsList: React.FC<RepoChipsListProps> = ({
  repositories,
  selectedRepoId,
  activeScans,
  onSelect,
}) => {
  return (
    <div data-testid="chip-container" className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth flex-nowrap py-0.5 flex-1 min-w-0">
      {repositories.map((repo) => {
        const isSelected = selectedRepoId === repo.id;
        const hasActiveScan = activeScans.some(
          (s) => s.repository_id === repo.id && (s.status === 'queued' || s.status === 'running')
        );

        return (
          <button
            key={repo.id}
            data-testid={`repo-chip-${repo.id}`}
            onClick={() => onSelect(repo)}
            className={`max-w-[14rem] h-8 px-2.5 rounded-md text-xs font-medium flex items-center gap-1.5 shrink-0 transition-colors border ${
              isSelected
                ? 'bg-blue-50 border-blue-400 text-blue-700 font-semibold shadow-xs'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-300 text-slate-700'
            }`}
            title={repo.full_name}
            aria-pressed={isSelected}
            aria-label={`Select repository ${repo.full_name}`}
          >
            {hasActiveScan ? (
              <span data-testid={`active-scan-dot-${repo.id}`} className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title="Scan in progress" />
            ) : (
              <GitBranch data-testid={`branch-icon-${repo.id}`} size={12} className={isSelected ? 'text-blue-600 shrink-0' : 'text-slate-400 shrink-0'} />
            )}
            <span className="truncate">{repo.full_name}</span>
          </button>
        );
      })}
    </div>
  );
};

describe('RepoChipsTruncation — Connected repositories horizontal list', () => {
  const mockRepos: Repository[] = [
    {
      id: 1,
      owner_id: 1,
      full_name: 'facebook/react',
      name: 'react',
      owner_name: 'facebook',
      url: 'https://github.com/facebook/react',
      default_branch: 'main',
      pinned_sha: null,
      is_private: false,
      created_at: '',
      updated_at: '',
      metadata_json: null,
    },
    {
      id: 2,
      owner_id: 1,
      full_name: 'Dhruvil1308/ComicCraft-AI-Smart-Comic-Generation-System',
      name: 'ComicCraft-AI-Smart-Comic-Generation-System',
      owner_name: 'Dhruvil1308',
      url: 'https://github.com/Dhruvil1308/ComicCraft-AI-Smart-Comic-Generation-System',
      default_branch: 'main',
      pinned_sha: null,
      is_private: false,
      created_at: '',
      updated_at: '',
      metadata_json: null,
    },
  ];

  it('renders single horizontal scrollable row with truncation class and title tooltip', () => {
    const handleSelect = vi.fn();
    render(
      <RepoChipsList
        repositories={mockRepos}
        selectedRepoId={1}
        activeScans={[]}
        onSelect={handleSelect}
      />
    );

    const container = screen.getByTestId('chip-container');
    expect(container).toHaveClass('overflow-x-auto');
    expect(container).toHaveClass('flex-nowrap');

    const longChip = screen.getByTestId('repo-chip-2');
    expect(longChip).toHaveClass('max-w-[14rem]');
    expect(longChip).toHaveAttribute('title', 'Dhruvil1308/ComicCraft-AI-Smart-Comic-Generation-System');

    fireEvent.click(longChip);
    expect(handleSelect).toHaveBeenCalledWith(mockRepos[1]);
  });

  it('shows green pulsing active scan dot only for repositories with queued or running scans', () => {
    const activeScans: ActiveScanItem[] = [
      {
        id: 101,
        repository_id: 2,
        repository_name: 'ComicCraft-AI-Smart-Comic-Generation-System',
        repository_full_name: 'Dhruvil1308/ComicCraft-AI-Smart-Comic-Generation-System',
        status: 'running',
        stage: 'running_scanners',
        commit_sha: null,
        created_at: '',
        started_at: '',
        elapsed_seconds: 12,
      },
    ];

    render(
      <RepoChipsList
        repositories={mockRepos}
        selectedRepoId={1}
        activeScans={activeScans}
        onSelect={vi.fn()}
      />
    );

    // Repo 1 does not have active scan
    expect(screen.queryByTestId('active-scan-dot-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('branch-icon-1')).toBeInTheDocument();

    // Repo 2 has active scan -> displays green dot
    expect(screen.getByTestId('active-scan-dot-2')).toBeInTheDocument();
    expect(screen.queryByTestId('branch-icon-2')).not.toBeInTheDocument();
  });
});
