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
      return <Database size={15} color="#2563eb" />;
    }
    if (text.includes('subprocess') || text.includes('command') || text.includes('ci')) {
      return <Terminal size={15} color="#d97706" />;
    }
    if (text.includes('secret') || text.includes('token') || text.includes('key')) {
      return <KeyRound size={15} color="#0d9488" />;
    }
    if (text.includes('xss') || text.includes('web') || text.includes('network')) {
      return <Globe size={15} color="#7c3aed" />;
    }
    if (issue.severity === 'critical') {
      return <ShieldAlert size={15} color="#e11d48" />;
    }
    return <FileCode size={15} color="#64748b" />;
  };

  const getScoreColor = (score: number) => {
    if (score >= 95) return { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' };
    if (score >= 80) return { bg: '#fffbeb', text: '#b45309', border: '#fde68a' };
    if (score >= 60) return { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' };
    return { bg: '#f0fdf4', text: '#059669', border: '#bbf7d0' };
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
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        marginBottom: '8px',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#f1f5f9';
        e.currentTarget.style.borderColor = '#cbd5e1';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = '#f8fafc';
        e.currentTarget.style.borderColor = '#e2e8f0';
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
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        {getIcon()}
      </div>

      {/* Main Details in Black font */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: '#0f172a',
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
          <span style={{ color: '#334155', fontWeight: 500 }}>{issue.category}</span>
          <span>|</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#2563eb', fontWeight: 600 }}>{issue.cwe_or_rule}</span>
          {issue.file_path && (
            <>
              <span>·</span>
              <span
                style={{
                  color: '#64748b',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '11px',
                }}
                title={`Exact repository location: ${issue.file_path}${issue.line_number ? `:${issue.line_number}` : ''}`}
              >
                {issue.file_path}{issue.line_number ? `:${issue.line_number}` : ''}
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
        <ChevronRight size={14} color="#94a3b8" />
      </div>
    </div>
  );
};
