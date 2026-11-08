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
      return <Database size={15} color="#38bdf8" />;
    }
    if (text.includes('subprocess') || text.includes('command') || text.includes('ci')) {
      return <Terminal size={15} color="#fbbf24" />;
    }
    if (text.includes('secret') || text.includes('token') || text.includes('key')) {
      return <KeyRound size={15} color="#34d399" />;
    }
    if (text.includes('xss') || text.includes('web') || text.includes('network')) {
      return <Globe size={15} color="#c084fc" />;
    }
    if (issue.severity === 'critical') {
      return <ShieldAlert size={15} color="#fb7185" />;
    }
    return <FileCode size={15} color="#94a3b8" />;
  };

  const getScoreColor = (score: number) => {
    if (score >= 95) return { bg: 'rgba(244, 63, 94, 0.15)', text: '#fb7185', border: 'rgba(244, 63, 94, 0.4)' };
    if (score >= 80) return { bg: 'rgba(245, 158, 11, 0.15)', text: '#fcd34d', border: 'rgba(245, 158, 11, 0.4)' };
    if (score >= 60) return { bg: 'rgba(56, 189, 248, 0.15)', text: '#7dd3fc', border: 'rgba(56, 189, 248, 0.4)' };
    return { bg: 'rgba(16, 185, 129, 0.15)', text: '#6ee7b7', border: 'rgba(16, 185, 129, 0.4)' };
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
        background: 'rgba(10, 18, 32, 0.7)',
        border: '1px solid rgba(56, 189, 248, 0.18)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        marginBottom: '8px',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(15, 25, 45, 0.85)';
        e.currentTarget.style.borderColor = 'rgba(0, 240, 255, 0.35)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(10, 18, 32, 0.7)';
        e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.18)';
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
          background: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid rgba(56, 189, 248, 0.2)',
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
            fontWeight: 700,
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
            color: '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '2px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <span style={{ color: '#cbd5e1', fontWeight: 500 }}>{issue.category}</span>
          <span style={{ color: '#64748b' }}>|</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#00f0ff', fontWeight: 600 }}>{issue.cwe_or_rule}</span>
          {issue.file_path && (
            <>
              <span style={{ color: '#64748b' }}>·</span>
              <span
                style={{
                  color: '#94a3b8',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '11px',
                }}
                title={`Exact repository location: ${issue.file_path}:${issue.line_number || 1}`}
              >
                {issue.file_path}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  background: 'rgba(56, 189, 248, 0.12)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  padding: '0 4px',
                  borderRadius: '3px',
                  fontWeight: 700,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
                title={`Line: ${issue.line_number || 1}`}
              >
                L{issue.line_number || 1}
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
