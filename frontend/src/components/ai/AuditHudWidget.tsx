import React from 'react';
import {
  CheckCircle,
  Clock,
  Layers,
  Cpu,
  Zap,
} from 'lucide-react';
import type { AuditHudWidgetData } from '../../types';

interface AuditHudWidgetProps {
  data: AuditHudWidgetData;
}

export const AuditHudWidget: React.FC<AuditHudWidgetProps> = ({ data }) => {
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
      {/* HUD Header */}
      <div
        style={{
          padding: '12px 16px',
          background: 'linear-gradient(90deg, #07162b 0%, #0c223e 100%)',
          borderBottom: '1px solid rgba(56, 189, 248, 0.2)',
          color: '#ffffff',
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
              background: '#0284c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Zap size={15} color="#00f0ff" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '13px', color: '#00f0ff' }}>
              LangGraph 4-Agent Live Security HUD
            </div>
            <div style={{ color: '#94a3b8', fontSize: '12px' }}>
              Target: {data.repo_name || 'Active Repository Context'}
            </div>
          </div>
        </div>

        {/* Confidence Gauge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(16, 185, 129, 0.12)',
            padding: '4px 10px',
            borderRadius: '8px',
            border: '1px solid rgba(16, 185, 129, 0.35)',
          }}
        >
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>Verification Grounding</div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#34d399' }}>
              {data.confidence_score}%
            </div>
          </div>
          <CheckCircle size={16} color="#34d399" />
        </div>
      </div>

      {/* Agents Stepper Bar */}
      <div style={{ padding: '14px 16px', background: '#050c18', borderBottom: '1px solid rgba(56, 189, 248, 0.18)' }}>
        <div style={{ fontWeight: 700, color: '#00f0ff', marginBottom: '8px', fontSize: '12px' }}>
          State Graph Execution Sequence:
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '8px',
          }}
        >
          {data.active_agents.map((agent, idx) => (
            <div
              key={idx}
              style={{
                padding: '8px 10px',
                borderRadius: '6px',
                background: '#071527',
                border: '1px solid rgba(56, 189, 248, 0.2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, color: '#ffffff', fontSize: '12px' }}>
                  {idx + 1}. {agent.name}
                </span>
                <span
                  style={{
                    fontSize: '12px',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: agent.status === 'verified' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                    color: agent.status === 'verified' ? '#6ee7b7' : '#38bdf8',
                    border: agent.status === 'verified' ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(56, 189, 248, 0.3)',
                    fontWeight: 700,
                  }}
                >
                  {agent.status}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.35 }}>
                {agent.details}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: '#38bdf8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginTop: '2px',
                }}
              >
                <Clock size={12} /> {agent.execution_time_ms}ms
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scanner Health & Threat Distribution */}
      <div
        style={{
          padding: '12px 16px',
          background: '#040a14',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
        }}
      >
        {/* Scanner Engine Status */}
        <div>
          <div
            style={{
              fontWeight: 700,
              color: '#00f0ff',
              marginBottom: '6px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Cpu size={12} color="#00f0ff" /> Scanner Engine Integration
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {Object.entries(data.scanner_coverage).map(([name, status]) => (
              <div
                key={name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '3px 8px',
                  background: '#071527',
                  border: '1px solid rgba(56, 189, 248, 0.15)',
                  borderRadius: '4px',
                  fontSize: '12px',
                }}
              >
                <span style={{ fontWeight: 600, color: '#ffffff' }}>{name}</span>
                <span style={{ color: '#34d399', fontWeight: 600 }}>{status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Threat Distribution Tally */}
        <div>
          <div
            style={{
              fontWeight: 700,
              color: '#00f0ff',
              marginBottom: '6px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Layers size={12} color="#f59e0b" /> Verified Threat Distribution
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <span
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                background: 'rgba(244, 63, 94, 0.18)',
                color: '#fb7185',
                fontWeight: 700,
                fontSize: '12px',
                border: '1px solid rgba(244, 63, 94, 0.4)',
              }}
            >
              Critical: {data.threat_tally.critical || 0}
            </span>
            <span
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                background: 'rgba(245, 158, 11, 0.18)',
                color: '#fcd34d',
                fontWeight: 700,
                fontSize: '12px',
                border: '1px solid rgba(245, 158, 11, 0.4)',
              }}
            >
              High: {data.threat_tally.high || 0}
            </span>
            <span
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                background: 'rgba(59, 130, 246, 0.18)',
                color: '#93c5fd',
                fontWeight: 700,
                fontSize: '12px',
                border: '1px solid rgba(59, 130, 246, 0.4)',
              }}
            >
              Medium: {data.threat_tally.medium || 0}
            </span>
            <span
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                background: 'rgba(16, 185, 129, 0.18)',
                color: '#6ee7b7',
                fontWeight: 700,
                fontSize: '12px',
                border: '1px solid rgba(16, 185, 129, 0.4)',
              }}
            >
              Low: {data.threat_tally.low || 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
