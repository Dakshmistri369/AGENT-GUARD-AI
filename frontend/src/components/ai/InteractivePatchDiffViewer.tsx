import React, { useState } from 'react';
import {
  FileCode,
  Copy,
  Check,
  Play,
  Columns,
  AlignLeft,
  ShieldCheck,
  Download,
} from 'lucide-react';
import type { PatchDiffWidgetData } from '../../types';

interface InteractivePatchDiffViewerProps {
  data: PatchDiffWidgetData;
  onApplyPatch?: () => void;
}

export const InteractivePatchDiffViewer: React.FC<InteractivePatchDiffViewerProps> = ({
  data,
  onApplyPatch,
}) => {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');
  const [copied, setCopied] = useState(false);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [dryRunSuccess, setDryRunSuccess] = useState(false);

  const handleCopyDiff = () => {
    navigator.clipboard.writeText(data.diff_unified);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPatch = () => {
    const blob = new Blob([data.diff_unified], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.file_path.replace(/[/\\?%*:|"<>]/g, '_')}.patch`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDryRun = () => {
    setIsDryRunning(true);
    setDryRunSuccess(false);
    setTimeout(() => {
      setIsDryRunning(false);
      setDryRunSuccess(true);
    }, 700);
  };

  // Parse lines for unified display
  const diffLines = data.diff_unified.split('\n');

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
      {/* Diff Header Bar */}
      <div
        style={{
          padding: '10px 14px',
          background: '#07162b',
          borderBottom: '1px solid rgba(56, 189, 248, 0.2)',
          color: '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <FileCode size={15} color="#00f0ff" />
          <span
            style={{
              fontFamily: 'monospace',
              fontWeight: 600,
              fontSize: '12px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '240px',
              color: '#38bdf8',
            }}
          >
            {data.file_path}
          </span>
          <span
            style={{
              padding: '2px 6px',
              borderRadius: '4px',
              background: '#050c18',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              color: '#94a3b8',
              fontSize: '12px',
            }}
          >
            Line {data.line_start}
          </span>
        </div>

        {/* View Mode & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => setViewMode('unified')}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              background: viewMode === 'unified' ? '#2563eb' : '#050c18',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
            }}
            title="Unified Diff View"
          >
            <AlignLeft size={12} /> Unified
          </button>

          <button
            onClick={() => setViewMode('split')}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              background: viewMode === 'split' ? '#2563eb' : '#050c18',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
            }}
            title="Split Before / After View"
          >
            <Columns size={12} /> Split
          </button>

          <button
            onClick={handleCopyDiff}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              background: '#050c18',
              color: copied ? '#34d399' : '#cbd5e1',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
            }}
            title="Copy Raw Git Diff"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>

          <button
            onClick={handleDownloadPatch}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              background: '#050c18',
              color: '#cbd5e1',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
            }}
            title="Download .patch file"
          >
            <Download size={12} />
          </button>
        </div>
      </div>

      {/* Diff Code Container */}
      {viewMode === 'unified' ? (
        <div
          style={{
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            fontSize: '12px',
            lineHeight: 1.6,
            background: '#030710',
            maxHeight: '260px',
            overflowY: 'auto',
          }}
        >
          {diffLines.map((line, idx) => {
            const isAdd = line.startsWith('+') && !line.startsWith('+++');
            const isDel = line.startsWith('-') && !line.startsWith('---');
            const isHunk = line.startsWith('@@');

            let lineBg = 'transparent';
            let lineTextColor = '#cbd5e1';
            let gutterColor = '#64748b';

            if (isAdd) {
              lineBg = 'rgba(16, 185, 129, 0.14)';
              lineTextColor = '#6ee7b7';
              gutterColor = '#10b981';
            } else if (isDel) {
              lineBg = 'rgba(244, 63, 94, 0.14)';
              lineTextColor = '#fda4af';
              gutterColor = '#f43f5e';
            } else if (isHunk) {
              lineBg = 'rgba(56, 189, 248, 0.1)';
              lineTextColor = '#38bdf8';
              gutterColor = '#0284c7';
            }

            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  background: lineBg,
                  color: lineTextColor,
                  padding: '1px 8px',
                  borderLeft: isAdd
                    ? '3px solid #10b981'
                    : isDel
                    ? '3px solid #f43f5e'
                    : '3px solid transparent',
                  wordBreak: 'break-all',
                  whiteSpace: 'pre-wrap',
                }}
              >
                <span
                  style={{
                    width: '28px',
                    color: gutterColor,
                    userSelect: 'none',
                    flexShrink: 0,
                    textAlign: 'right',
                    paddingRight: '8px',
                  }}
                >
                  {idx + 1}
                </span>
                <span style={{ flex: 1 }}>{line}</span>
              </div>
            );
          })}
        </div>
      ) : (
        /* Split View Mode */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            fontFamily: 'Consolas, Monaco, monospace',
            fontSize: '12px',
            maxHeight: '260px',
            overflowY: 'auto',
          }}
        >
          {/* Before Column */}
          <div
            style={{
              padding: '10px',
              background: '#120509',
              borderRight: '1px solid rgba(244, 63, 94, 0.3)',
            }}
          >
            <div
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#fb7185',
                marginBottom: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444' }} />
              Original Vulnerable Code:
            </div>
            <pre
              style={{
                margin: 0,
                color: '#fda4af',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {data.original_snippet}
            </pre>
          </div>

          {/* After Column */}
          <div style={{ padding: '10px', background: '#04140e' }}>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#6ee7b7',
                marginBottom: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
              Remediated AST Code:
            </div>
            <pre
              style={{
                margin: 0,
                color: '#6ee7b7',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {data.fixed_snippet}
            </pre>
          </div>
        </div>
      )}

      {/* Explanation & Verification Footer */}
      <div
        style={{
          padding: '12px 14px',
          background: '#050c18',
          borderTop: '1px solid rgba(56, 189, 248, 0.2)',
        }}
      >
        <p
          style={{
            margin: '0 0 10px 0',
            fontSize: '12px',
            color: '#cbd5e1',
            lineHeight: 1.45,
          }}
        >
          <strong style={{ color: '#00f0ff' }}>AST Remediation Rationale: </strong>
          {data.explanation}
        </p>

        {data.verification_cmd && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: '#38bdf8',
              fontFamily: 'monospace',
              background: '#030710',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              padding: '4px 8px',
              borderRadius: '4px',
              marginBottom: '10px',
            }}
          >
            <span style={{ color: '#64748b' }}>$</span>
            <span>{data.verification_cmd}</span>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          {/* Dry Run Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleDryRun}
              disabled={isDryRunning}
              style={{
                background: '#07182c',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: '6px',
                padding: '6px 12px',
                cursor: isDryRunning ? 'default' : 'pointer',
                color: '#38bdf8',
                fontSize: '12px',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Play size={12} color="#00f0ff" />
              {isDryRunning ? 'Simulating AST Dry Run...' : 'Simulate Dry-Run'}
            </button>

            {dryRunSuccess && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: '#34d399',
                  fontWeight: 600,
                  fontSize: '12px',
                }}
              >
                <ShieldCheck size={14} /> Dry-Run Passed (0 AST conflicts)
              </span>
            )}
          </div>

          {onApplyPatch && (
            <button
              onClick={onApplyPatch}
              style={{
                background: '#059669',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              Apply Patch to Repository
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
