import React, { useState } from 'react';
import {
  ShieldAlert,
  ExternalLink,
  Copy,
  Check,
  Terminal,
  AlertTriangle,
  ArrowRight,
  Flame,
} from 'lucide-react';
import type { CveRemediationWidgetData } from '../../types';

interface CveRemediationCardProps {
  data: CveRemediationWidgetData;
  onApplyFix?: (packageName: string, fixedVersion: string) => void;
}

export const CveRemediationCard: React.FC<CveRemediationCardProps> = ({
  data,
  onApplyFix,
}) => {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const getSeverityStyle = (sev: string) => {
    switch (sev.toLowerCase()) {
      case 'critical':
        return {
          bg: 'rgba(244, 63, 94, 0.18)',
          text: '#fb7185',
          border: 'rgba(244, 63, 94, 0.45)',
          indicator: '#f43f5e',
        };
      case 'high':
        return {
          bg: 'rgba(245, 158, 11, 0.18)',
          text: '#fcd34d',
          border: 'rgba(245, 158, 11, 0.45)',
          indicator: '#f59e0b',
        };
      case 'medium':
        return {
          bg: 'rgba(59, 130, 246, 0.18)',
          text: '#93c5fd',
          border: 'rgba(59, 130, 246, 0.45)',
          indicator: '#3b82f6',
        };
      default:
        return {
          bg: 'rgba(16, 185, 129, 0.18)',
          text: '#6ee7b7',
          border: 'rgba(16, 185, 129, 0.45)',
          indicator: '#10b981',
        };
    }
  };

  const sevStyle = getSeverityStyle(data.severity);
  const fixCommand =
    data.ecosystem.toLowerCase() === 'pypi' || data.ecosystem.toLowerCase() === 'python'
      ? `pip install --upgrade "${data.package_name}${data.fixed_version.startsWith('>=') ? data.fixed_version : `==${data.fixed_version}`}"`
      : data.ecosystem.toLowerCase() === 'go'
      ? `go get -u ${data.package_name}@${data.fixed_version.replace('>=', 'v')}`
      : `npm install "${data.package_name}@${data.fixed_version.replace('>=', '')}"`;

  return (
    <div
      style={{
        margin: '12px 0',
        borderRadius: '12px',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        background: 'rgba(8, 18, 34, 0.95)',
        boxShadow: '0 4px 18px rgba(0, 0, 0, 0.4)',
        overflow: 'hidden',
        fontSize: '12px',
      }}
    >
      {/* Top Banner Header */}
      <div
        style={{
          padding: '12px 16px',
          background: 'linear-gradient(90deg, #07162b 0%, #0c223e 100%)',
          borderBottom: '1px solid rgba(56, 189, 248, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              background: sevStyle.bg,
              border: `1px solid ${sevStyle.border}`,
              color: sevStyle.text,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '12px',
            }}
          >
            <ShieldAlert size={14} color={sevStyle.indicator} />
            <span>{data.cve_id}</span>
          </div>

          <span
            style={{
              padding: '3px 8px',
              borderRadius: '999px',
              background: '#071527',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              color: '#94a3b8',
              fontWeight: 600,
              fontSize: '12px',
            }}
          >
            {data.ecosystem}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* CVSS meter */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 10px',
              borderRadius: '6px',
              background: sevStyle.bg,
              border: `1px solid ${sevStyle.border}`,
              color: sevStyle.text,
              fontWeight: 700,
              fontSize: '12px',
            }}
          >
            <span>CVSS</span>
            <span style={{ fontSize: '13px' }}>{data.cvss_score.toFixed(1)}</span>
          </div>

          {/* EPSS Score Pill */}
          {data.epss_score !== undefined && data.epss_score !== null && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '6px',
                background: 'rgba(245, 158, 11, 0.15)',
                color: '#fcd34d',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                fontWeight: 600,
                fontSize: '12px',
              }}
              title="Exploit Prediction Scoring System probability"
            >
              <Flame size={12} />
              <span>EPSS {(data.epss_score * 100).toFixed(0)}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Body Content */}
      <div style={{ padding: '16px' }}>
        <h4
          style={{
            margin: '0 0 8px 0',
            fontSize: '13.5px',
            fontWeight: 700,
            color: '#ffffff',
            lineHeight: 1.4,
          }}
        >
          {data.title}
        </h4>

        <p
          style={{
            margin: '0 0 14px 0',
            color: '#cbd5e1',
            lineHeight: 1.5,
            fontSize: '12px',
          }}
        >
          {data.summary}
        </p>

        {/* Affected Package & Fixed-In Pill */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '8px',
            padding: '10px 12px',
            background: '#050c18',
            borderRadius: '8px',
            border: '1px solid rgba(56, 189, 248, 0.2)',
            marginBottom: '14px',
          }}
        >
          <div>
            <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>
              Package & Vulnerable Range
            </div>
            <div style={{ color: '#ffffff', fontWeight: 600, marginTop: '2px' }}>
              <code style={{ color: '#38bdf8' }}>{data.package_name}</code>{' '}
              <span style={{ color: '#fb7185' }}>{data.vulnerable_range}</span>
            </div>
          </div>

          <div>
            <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>
              Fixed Version
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              <span
                style={{
                  color: '#6ee7b7',
                  fontWeight: 700,
                  background: 'rgba(16, 185, 129, 0.2)',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                }}
              >
                {data.fixed_version}
              </span>
              <button
                onClick={() => handleCopy(data.fixed_version, 'version')}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: copied === 'version' ? '#34d399' : '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Copy Fixed Version"
              >
                {copied === 'version' ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          </div>
        </div>

        {/* CWE Classification if present */}
        {data.cwe && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '14px',
              fontSize: '12px',
              color: '#94a3b8',
            }}
          >
            <AlertTriangle size={14} color="#f59e0b" />
            <span style={{ fontWeight: 600, color: '#e2e8f0' }}>Classification:</span>
            <span style={{ color: '#fcd34d' }}>{data.cwe}</span>
          </div>
        )}

        {/* Mitigation Checklist */}
        {data.mitigation_steps && data.mitigation_steps.length > 0 && (
          <div style={{ marginBottom: '14px' }}>
            <div
              style={{
                fontWeight: 700,
                color: '#00f0ff',
                marginBottom: '6px',
                fontSize: '12px',
              }}
            >
              Actionable Mitigation Playbook:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {data.mitigation_steps.map((step, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '6px',
                    color: '#e2e8f0',
                    fontSize: '12px',
                    lineHeight: 1.45,
                  }}
                >
                  <ArrowRight
                    size={12}
                    color="#38bdf8"
                    style={{ flexShrink: 0, marginTop: '3px' }}
                  />
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick CLI Fix Command */}
        <div
          style={{
            background: '#030710',
            borderRadius: '6px',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            marginBottom: '14px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#94a3b8',
              fontFamily: 'monospace',
              fontSize: '12px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            <Terminal size={13} color="#00f0ff" />
            <span style={{ color: '#38bdf8' }}>{fixCommand}</span>
          </div>
          <button
            onClick={() => handleCopy(fixCommand, 'cmd')}
            style={{
              background: '#07182c',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              color: copied === 'cmd' ? '#34d399' : '#cbd5e1',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              flexShrink: 0,
            }}
          >
            {copied === 'cmd' ? <Check size={12} /> : <Copy size={12} />}
            {copied === 'cmd' ? 'Copied' : 'Copy'}
          </button>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            borderTop: '1px solid rgba(56, 189, 248, 0.18)',
            paddingTop: '10px',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {data.references &&
              data.references.slice(0, 2).map((ref, idx) => (
                <a
                  key={idx}
                  href={ref}
                  target="_blank"
                  rel="noreferrer noopener"
                  style={{
                    color: '#38bdf8',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  Advisory Reference <ExternalLink size={12} />
                </a>
              ))}
          </div>

          {onApplyFix && (
            <button
              onClick={() => onApplyFix(data.package_name, data.fixed_version)}
              style={{
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              Apply Remediated Version
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
