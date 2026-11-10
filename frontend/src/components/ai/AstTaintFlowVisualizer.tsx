import React, { useState } from 'react';
import {
  GitMerge,
  ArrowDown,
  AlertCircle,
  Code2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { AstTaintFlowWidgetData } from '../../types';

interface AstTaintFlowVisualizerProps {
  data: AstTaintFlowWidgetData;
}

export const AstTaintFlowVisualizer: React.FC<AstTaintFlowVisualizerProps> = ({ data }) => {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  const toggleStep = (stepNum: number) => {
    setExpandedStep(expandedStep === stepNum ? null : stepNum);
  };

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
      {/* Header */}
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
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'rgba(244, 63, 94, 0.18)',
              color: '#f43f5e',
              border: '1px solid rgba(244, 63, 94, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <GitMerge size={16} />
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#ffffff', fontSize: '13px' }}>
              AST Data Flow & Taint Analysis
            </div>
            <div style={{ color: '#94a3b8', fontSize: '12px' }}>
              {data.vulnerability_type} • <span style={{ color: '#f87171', fontWeight: 600 }}>{data.cwe_id}</span>
            </div>
          </div>
        </div>

        <span
          style={{
            padding: '3px 8px',
            borderRadius: '999px',
            background: '#071527',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            color: '#38bdf8',
            fontWeight: 600,
            fontSize: '12px',
          }}
        >
          {data.taint_steps.length + 2} Node Trajectory
        </span>
      </div>

      {/* Trajectory Stream */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* 1. Untrusted Source Node */}
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'rgba(244, 63, 94, 0.12)',
            border: '1px solid rgba(244, 63, 94, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                color: '#fb7185',
                fontWeight: 700,
                fontSize: '12px',
              }}
            >
              <AlertCircle size={14} color="#f43f5e" /> [SOURCE] Untrusted Input Entry Point
            </span>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#fda4af',
                background: '#1c0d12',
                border: '1px solid rgba(244, 63, 94, 0.25)',
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >
              {data.source_node.ast_type}
            </span>
          </div>

          <div
            style={{
              fontFamily: 'monospace',
              fontSize: '12px',
              color: '#fda4af',
              background: '#040810',
              padding: '6px 10px',
              borderRadius: '4px',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              marginTop: '4px',
            }}
          >
            {data.source_node.name}
          </div>
          {data.source_node.file && (
            <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '2px' }}>
              Location: <code>{data.source_node.file}:{data.source_node.line}</code>
            </div>
          )}
        </div>

        {/* Down Connector */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <ArrowDown size={14} color="#38bdf8" />
        </div>

        {/* 2. Intermediate Taint Steps */}
        {data.taint_steps.map((step) => {
          const isOpen = expandedStep === step.step_number;
          return (
            <div key={step.step_number} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div
                onClick={() => toggleStep(step.step_number)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: '#060e1d',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'background 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: '#0284c7',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  >
                    {step.step_number}
                  </span>
                  <div>
                    <span style={{ fontWeight: 600, color: '#ffffff', fontSize: '12px' }}>
                      {step.title}
                    </span>
                    <span style={{ color: '#38bdf8', fontSize: '12px', marginLeft: '6px' }}>
                      ({step.node_type})
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {isOpen ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
                </div>
              </div>

              {isOpen && (
                <div
                  style={{
                    padding: '10px 12px',
                    background: '#030813',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#cbd5e1',
                    marginLeft: '12px',
                    borderLeft: '3px solid #00f0ff',
                  }}
                >
                  <p style={{ margin: '0 0 6px 0', lineHeight: 1.4 }}>{step.description}</p>
                  <pre
                    style={{
                      margin: 0,
                      background: '#02050b',
                      color: '#f8fafc',
                      padding: '6px 10px',
                      borderRadius: '4px',
                      border: '1px solid rgba(56, 189, 248, 0.15)',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      overflowX: 'auto',
                    }}
                  >
                    {step.code_snippet}
                  </pre>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <ArrowDown size={14} color="#38bdf8" />
              </div>
            </div>
          );
        })}

        {/* 3. Dangerous Sink Node */}
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'rgba(225, 29, 72, 0.15)',
            border: '1px solid rgba(225, 29, 72, 0.4)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                color: '#f43f5e',
                fontWeight: 700,
                fontSize: '12px',
              }}
            >
              <Code2 size={14} color="#f43f5e" /> [SINK] Dangerous Execution Sink
            </span>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#fda4af',
                background: '#1f090e',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >
              {data.sink_node.ast_type}
            </span>
          </div>

          <div
            style={{
              fontFamily: 'monospace',
              fontSize: '12px',
              color: '#fca5a5',
              background: '#040810',
              padding: '6px 10px',
              borderRadius: '4px',
              border: '1px solid rgba(244, 63, 94, 0.35)',
              marginTop: '4px',
            }}
          >
            {data.sink_node.name}
          </div>
          {data.sink_node.file && (
            <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '2px' }}>
              Sink Call: <code style={{ color: '#38bdf8' }}>{data.sink_node.dangerous_call}</code> at {data.sink_node.file}:{data.sink_node.line}
            </div>
          )}
        </div>

        {/* 4. Recommended Sanitizer AST Injection Point */}
        {data.sanitizer_recommendation && (
          <div
            style={{
              marginTop: '10px',
              padding: '12px',
              borderRadius: '8px',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: '#34d399',
                fontWeight: 700,
                marginBottom: '6px',
                fontSize: '12px',
              }}
            >
              <CheckCircle2 size={14} color="#10b981" /> Recommended Defensive Sanitizer Insertion
            </div>
            {data.sanitizer_recommendation.recommended_code && (
              <pre
                style={{
                  margin: 0,
                  background: '#020f09',
                  color: '#6ee7b7',
                  padding: '8px 10px',
                  borderRadius: '4px',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  overflowX: 'auto',
                }}
              >
                {data.sanitizer_recommendation.recommended_code}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
