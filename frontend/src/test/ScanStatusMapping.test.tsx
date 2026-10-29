import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CheckCircle2, RotateCw, XCircle, Clock } from 'lucide-react';
import type { Scan } from '../types';

/**
 * Helper representing the status header and action logic in Repositories
 */
const ScanStatusCard: React.FC<{
  scan: Partial<Scan> | null;
  isScanning?: boolean;
  onCancel?: () => void;
  onStart?: () => void;
}> = ({ scan, isScanning = false, onCancel, onStart }) => {
  const isScanActive = isScanning || scan?.status === 'running' || scan?.status === 'queued' || scan?.status === 'pending';
  const isScanTerminal = Boolean(scan && (scan.status === 'completed' || scan.status === 'failed' || scan.status === 'timed_out_partial' || scan.status === 'cancelled'));
  const isScanFailed = scan?.status === 'failed';

  return (
    <div>
      <div data-testid="scan-header" className="scan-header">
        {isScanActive ? (
          <span data-testid="status-active">
            <RotateCw data-testid="spinner-icon" />
            {scan?.status === 'queued' ? `Scan #${scan?.id || ''} Queued — Waiting for Worker Slot` : `Security Verification in Progress — ${scan?.stage || 'running'}`}
          </span>
        ) : scan?.status === 'completed' ? (
          <span data-testid="status-completed">
            <CheckCircle2 data-testid="completed-icon" />
            Scan #{scan?.id} Completed
          </span>
        ) : isScanFailed ? (
          <span data-testid="status-failed">
            <XCircle data-testid="failed-icon" />
            Scan #{scan?.id} Failed
          </span>
        ) : scan?.status === 'timed_out_partial' ? (
          <span data-testid="status-partial">
            Scan #{scan?.id} Completed with Partial Results
          </span>
        ) : (
          <span data-testid="status-idle">
            <Clock data-testid="idle-icon" />
            Ready for Analysis
          </span>
        )}

        {/* Finished timestamp strictly only when terminal */}
        {!isScanActive && isScanTerminal && scan?.completed_at && (
          <span data-testid="finished-timestamp">
            Finished: {new Date(scan.completed_at).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Real-time Progress Bar strictly only when active */}
      {isScanActive && (
        <div data-testid="progress-bar" role="progressbar" />
      )}

      {/* Action buttons */}
      <div data-testid="action-buttons">
        {isScanActive ? (
          <button data-testid="cancel-btn" onClick={onCancel}>
            Cancel Scan
          </button>
        ) : (
          <button data-testid="analyze-btn" onClick={onStart}>
            {isScanFailed || scan?.status === 'timed_out_partial' ? 'Retry Security Analysis' : 'Analyze Repository'}
          </button>
        )}
      </div>
    </div>
  );
};

describe('ScanStatusMapping — Contradiction-free state rendering', () => {
  it('renders queued scan correctly: shows active spinner, progress bar, Cancel button, hides finished timestamp', () => {
    const queuedScan: Partial<Scan> = {
      id: 58,
      status: 'queued',
      completed_at: '2026-10-29T10:00:00Z', // stale completed_at from previous scan must be suppressed
    };

    render(<ScanStatusCard scan={queuedScan} />);

    expect(screen.getByTestId('status-active')).toHaveTextContent('Scan #58 Queued — Waiting for Worker Slot');
    expect(screen.getByTestId('spinner-icon')).toBeInTheDocument();
    expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('analyze-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('finished-timestamp')).not.toBeInTheDocument();
  });

  it('renders running scan correctly: shows in-progress stage and cancel action', () => {
    const runningScan: Partial<Scan> = {
      id: 59,
      status: 'running',
      stage: 'running_scanners',
    };

    render(<ScanStatusCard scan={runningScan} />);

    expect(screen.getByTestId('status-active')).toHaveTextContent('Security Verification in Progress — running_scanners');
    expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('analyze-btn')).not.toBeInTheDocument();
  });

  it('renders completed scan correctly: shows completed icon, finished timestamp, Analyze Repository button, and NO cancel button', () => {
    const completedScan: Partial<Scan> = {
      id: 60,
      status: 'completed',
      completed_at: '2026-10-29T12:00:00Z',
    };

    render(<ScanStatusCard scan={completedScan} />);

    expect(screen.getByTestId('status-completed')).toHaveTextContent('Scan #60 Completed');
    expect(screen.getByTestId('completed-icon')).toBeInTheDocument();
    expect(screen.getByTestId('finished-timestamp')).toBeInTheDocument();
    expect(screen.queryByTestId('progress-bar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cancel-btn')).not.toBeInTheDocument();
    expect(screen.getByTestId('analyze-btn')).toHaveTextContent('Analyze Repository');
  });

  it('renders failed scan correctly: shows failed icon, Retry Security Analysis button, and NO cancel button', () => {
    const failedScan: Partial<Scan> = {
      id: 61,
      status: 'failed',
      error_message: 'Worker timed out executing semgrep',
      completed_at: '2026-10-29T12:05:00Z',
    };

    render(<ScanStatusCard scan={failedScan} />);

    expect(screen.getByTestId('status-failed')).toHaveTextContent('Scan #61 Failed');
    expect(screen.getByTestId('failed-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('cancel-btn')).not.toBeInTheDocument();
    expect(screen.getByTestId('analyze-btn')).toHaveTextContent('Retry Security Analysis');
    expect(screen.queryByTestId('progress-bar')).not.toBeInTheDocument();
  });

  it('renders timed_out_partial scan correctly: displays partial notice and Retry option', () => {
    const partialScan: Partial<Scan> = {
      id: 62,
      status: 'timed_out_partial',
      completed_at: '2026-10-29T12:10:00Z',
    };

    render(<ScanStatusCard scan={partialScan} />);

    expect(screen.getByTestId('status-partial')).toHaveTextContent('Scan #62 Completed with Partial Results');
    expect(screen.getByTestId('finished-timestamp')).toBeInTheDocument();
    expect(screen.getByTestId('analyze-btn')).toHaveTextContent('Retry Security Analysis');
    expect(screen.queryByTestId('cancel-btn')).not.toBeInTheDocument();
  });
});
