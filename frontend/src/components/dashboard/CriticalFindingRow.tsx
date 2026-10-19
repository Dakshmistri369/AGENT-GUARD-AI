import React from 'react';
import {
  ChevronRight,
  Database,
  Terminal,
  KeyRound,
  ShieldAlert,
  FileCode,
  Globe,
} from 'lucide-react';
import type { CriticalIssueItem } from '../../types';

export interface CriticalFindingRowProps {
  issue: CriticalIssueItem;
  onClick: (issue: CriticalIssueItem) => void;
}

export const CriticalFindingRow: React.FC<CriticalFindingRowProps> = ({ issue, onClick }) => {
  // Determine relevant icon based on category/scanner
  const getIcon = () => {
    const text = `${issue.category} ${issue.title} ${issue.cwe_or_rule}`.toLowerCase();
    if (text.includes('sql') || text.includes('database')) {
      return <Database size={15} color="#60a5fa" />;
    }
    if (text.includes('subprocess') || text.includes('command') || text.includes('ci')) {
      return <Terminal size={15} color="#f59e0b" />;
    }
    if (text.includes('secret') || text.includes('token') || text.includes('key')) {
      return <KeyRound size={15} color="#2dd4bf" />;
    }
    if (text.includes('xss') || text.includes('web') || text.includes('network')) {
      return <Globe size={15} color="#a855f7" />;
    }
    if (issue.severity === 'critical') {
      return <ShieldAlert size={15} color="#f43f5e" />;
    }
    return <FileCode size={15} color="#94a3b8" />;
  };

  const getScoreColor = (score: number) => {
    if (score >= 95) return { bg: 'rgba(244, 63, 94, 0.15)', text: '#f43f5e', border: 'rgba(244, 63, 94, 0.35)' };
    if (score >= 80) return { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.35)' };
    if (score >= 60) return { bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa', border: 'rgba(59, 130, 246, 0.35)' };
    return { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.35)' };
  };

  const scoreBadge = getScoreColor(issue.score);

  return (
    <div
      onClick={() => onClick(issue)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 14px',
        borderRadius: '8px',
        background: 'rgba(15, 23, 42, 0.5)',
        border: '1px solid rgba(30, 58, 110, 0.3)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        marginBottom: '8px',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(30, 58, 110, 0.35)';
        e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.45)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
        e.currentTarget.style.borderColor = 'rgba(30, 58, 110, 0.3)';
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(issue);
        }
      }}
      aria-label={`View critical issue: ${issue.title}`}
    >
      {/* Icon Emblem Box */}
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          background: 'rgba(7, 14, 27, 0.8)',
          border: '1px solid rgba(30, 58, 110, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        {getIcon()}
      </div>

      {/* Main Details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: '#f8fafc',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={issue.title}
        >
          {issue.title}
        </div>
        <div
          style={{
            fontSize: '11px',
            color: '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '2px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <span style={{ color: '#94a3b8' }}>{issue.category}</span>
          <span>|</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#60a5fa' }}>{issue.cwe_or_rule}</span>
          {issue.file_path && (
            <>
              <span>·</span>
              <span style={{ color: '#64748b' }}>
                {issue.file_path.split('/').pop()}
                {issue.line_number ? `:${issue.line_number}` : ''}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Score badge & Arrow */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            fontFamily: 'JetBrains Mono, monospace',
            padding: '2px 8px',
            borderRadius: '6px',
            background: scoreBadge.bg,
            color: scoreBadge.text,
            border: `1px solid ${scoreBadge.border}`,
          }}
          title={`Calculated Severity Risk Score: ${issue.score}/100`}
        >
          {issue.score}
        </span>
        <ChevronRight size={14} color="#64748b" />
      </div>
    </div>
  );
};
