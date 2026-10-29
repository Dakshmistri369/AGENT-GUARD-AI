import { describe, it, expect } from 'vitest';
import type { ActiveScanItem } from '../types';

export function filterActiveScans(scans: ActiveScanItem[]): ActiveScanItem[] {
  return (scans ?? []).filter(
    (s) => s.status === 'queued' || s.status === 'running'
  );
}

describe('ActiveScansCount — Filtering and counting logic', () => {
  it('counts only queued and running scans as active', () => {
    const mockScans: ActiveScanItem[] = [
      { id: 1, repository_id: 10, repository_name: 'repo-a', repository_full_name: 'org/repo-a', status: 'queued', stage: 'queued', commit_sha: null, created_at: '', started_at: null, elapsed_seconds: 1 },
      { id: 2, repository_id: 11, repository_name: 'repo-b', repository_full_name: 'org/repo-b', status: 'running', stage: 'running_scanners', commit_sha: null, created_at: '', started_at: '', elapsed_seconds: 10 },
      { id: 3, repository_id: 12, repository_name: 'repo-c', repository_full_name: 'org/repo-c', status: 'completed' as any, stage: 'generating_report', commit_sha: null, created_at: '', started_at: '', elapsed_seconds: 25 },
      { id: 4, repository_id: 13, repository_name: 'repo-d', repository_full_name: 'org/repo-d', status: 'failed' as any, stage: 'validating', commit_sha: null, created_at: '', started_at: '', elapsed_seconds: 5 },
      { id: 5, repository_id: 14, repository_name: 'repo-e', repository_full_name: 'org/repo-e', status: 'timed_out_partial' as any, stage: 'running_scanners', commit_sha: null, created_at: '', started_at: '', elapsed_seconds: 900 },
      { id: 6, repository_id: 15, repository_name: 'repo-f', repository_full_name: 'org/repo-f', status: 'cancelled' as any, stage: 'validating', commit_sha: null, created_at: '', started_at: '', elapsed_seconds: 3 },
    ];

    const active = filterActiveScans(mockScans);

    expect(active.length).toBe(2);
    expect(active.map((s) => s.id)).toEqual([1, 2]);
    expect(active.every((s) => s.status === 'queued' || s.status === 'running')).toBe(true);
  });

  it('returns empty array when all scans are in terminal states', () => {
    const mockScans: ActiveScanItem[] = [
      { id: 10, repository_id: 20, repository_name: 'repo-1', repository_full_name: 'org/repo-1', status: 'completed' as any, stage: 'done', commit_sha: null, created_at: '', started_at: '', elapsed_seconds: 15 },
      { id: 11, repository_id: 21, repository_name: 'repo-2', repository_full_name: 'org/repo-2', status: 'failed' as any, stage: 'error', commit_sha: null, created_at: '', started_at: '', elapsed_seconds: 2 },
    ];

    const active = filterActiveScans(mockScans);

    expect(active.length).toBe(0);
    expect(active).toEqual([]);
  });

  it('handles null or empty list gracefully', () => {
    expect(filterActiveScans([]).length).toBe(0);
    expect(filterActiveScans(null as any).length).toBe(0);
  });
});
