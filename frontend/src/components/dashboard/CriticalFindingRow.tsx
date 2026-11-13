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

function resolveCweIdentifier(cweOrRule?: string, category?: string, title?: string): string {
  const text = `${cweOrRule || ''} ${category || ''} ${title || ''}`.toLowerCase();
  const match = (cweOrRule || '').match(/CWE-\d+/i);
  if (match) return match[0].toUpperCase();
  if (text.includes('subprocess') || text.includes('command') || text.includes('b602') || text.includes('b603') || text.includes('shell')) return 'CWE-78';
  if (text.includes('sql') || text.includes('b608') || text.includes('injection')) return 'CWE-89';
  if (text.includes('secret') || text.includes('token') || text.includes('key') || text.includes('credential') || text.includes('b105')) return 'CWE-798';
  if (text.includes('xss') || text.includes('cross-site')) return 'CWE-79';
  if (text.includes('path') || text.includes('traversal')) return 'CWE-22';
  if (text.includes('pickle') || text.includes('deserial')) return 'CWE-502';
  if (text.includes('crypto') || text.includes('md5') || text.includes('b303')) return 'CWE-327';
  return cweOrRule && cweOrRule.startsWith('CWE') ? cweOrRule : 'CWE-78';
}

function formatScannerClassification(scanner?: string): { type: 'SAST' | 'SCA' | 'Secrets'; label: string; badgeColor: string } {
  const s = (scanner || '').toLowerCase();
  if (s.includes('osv')) {
    return { type: 'SCA', label: 'SCA · OSV', badgeColor: '#38bdf8' };
  }
  if (s.includes('bandit')) {
    return { type: 'SAST', label: 'SAST · Bandit AST', badgeColor: '#a855f7' };
  }
  if (s.includes('semgrep')) {
    return { type: 'SAST', label: 'SAST · Semgrep', badgeColor: '#00f0ff' };
  }
  if (s.includes('secret')) {
    return { type: 'Secrets', label: 'Secrets · detect-secrets', badgeColor: '#f43f5e' };
  }
  return { type: 'SAST', label: 'SAST · Core', badgeColor: '#10b981' };
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

  const rawScore = issue.score ?? 90;
  const cvssScore = rawScore > 10 ? (rawScore / 10).toFixed(1) : Number(rawScore).toFixed(1);
  const cvssNum = parseFloat(cvssScore);

  const getScoreColor = (cvss: number) => {
    if (cvss >= 9.0) return { bg: 'rgba(147, 0, 10, 0.25)', text: '#ffb4ab', border: 'rgba(255, 180, 171, 0.4)' };
    if (cvss >= 7.0) return { bg: 'rgba(143, 17, 3, 0.2)', text: '#ffb4a6', border: 'rgba(255, 180, 166, 0.4)' };
    if (cvss >= 4.0) return { bg: 'rgba(139, 223, 221, 0.1)', text: '#8bdfdd', border: 'rgba(139, 223, 221, 0.3)' };
    return { bg: 'rgba(139, 223, 221, 0.08)', text: '#a7fcfa', border: 'rgba(139, 223, 221, 0.25)' };
  };

  const scoreBadge = getScoreColor(cvssNum);
  const cweId = resolveCweIdentifier(issue.cwe_or_rule, issue.category, issue.title);
  const scannerInfo = formatScannerClassification(issue.scanner);

  return (
    <div
      onClick={() => onClick(issue)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 14px',
        borderRadius: '4px',
        background: '#1f1f23',
        border: '1px solid rgba(62, 73, 72, 0.4)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        marginBottom: '8px',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#292a2d';
        e.currentTarget.style.borderColor = 'rgba(139, 223, 221, 0.35)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = '#1f1f23';
        e.currentTarget.style.borderColor = 'rgba(62, 73, 72, 0.4)';
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
          borderRadius: '4px',
          background: '#1b1b1f',
          border: '1px solid rgba(62, 73, 72, 0.45)',
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
            fontSize: '13.5px',
            fontWeight: 600,
            color: '#e3e2e6',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontFamily: "'Space Grotesk', sans-serif",
          }}
          title={issue.title}
        >
          {issue.title}
        </div>
        <div
          style={{
            fontSize: '11px',
            color: '#bdc9c8',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '2px',
            whiteSpace: 'nowrap',
            fontFamily: "'Inter', sans-serif",
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {/* Scanner classification tag */}
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: '4px',
              background: 'rgba(15, 23, 42, 0.9)',
              color: scannerInfo.badgeColor,
              border: `1px solid ${scannerInfo.badgeColor}40`,
            }}
          >
            {scannerInfo.label}
          </span>
          {/* Prominent CWE tag */}
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '10.5px',
              fontWeight: 700,
              color: '#00f0ff',
              background: 'rgba(0, 240, 255, 0.1)',
              border: '1px solid rgba(0, 240, 255, 0.3)',
              padding: '1px 5px',
              borderRadius: '4px',
            }}
            title="Common Weakness Enumeration"
          >
            {cweId}
          </span>
          <span style={{ color: '#64748b' }}>·</span>
          <span style={{ color: '#cbd5e1', fontWeight: 500 }}>{issue.category}</span>
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

      {/* CVSS v3.1 Score badge & Arrow */}
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
            letterSpacing: '0.2px',
          }}
          title={`CVSS v3.1 Severity Score: ${cvssScore} / 10.0 (${issue.severity.toUpperCase()})`}
        >
          CVSS {cvssScore}
        </span>
        <ChevronRight size={14} color="#64748b" />
      </div>
    </div>
  );
};
