import React from 'react';
import { Settings as SettingsIcon, AlertCircle, Shield, Cpu, Database, Package } from 'lucide-react';

export const SettingsPage: React.FC = () => (
  <div style={{ padding: '32px', maxWidth: '700px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
      <SettingsIcon size={20} color="var(--electric-blue)" />
      <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>Settings</h1>
    </div>

    {/* Auth mode */}
    <Section title="Authentication" icon={<Shield size={14} color="var(--accent-amber)" />}>
      <InfoRow label="Auth Mode" value="DEMO — no real auth active (Phase 1)" warn />
      <InfoRow label="Current User" value="demo@agentguard.local (seeded)" warn />
      <InfoRow label="JWT Auth" value="Not implemented — Phase 6" />
    </Section>

    {/* AI Provider */}
    <Section title="AI Provider" icon={<Cpu size={14} color="var(--electric-blue)" />}>
      <InfoRow label="Active Provider" value="MockProvider" warn />
      <InfoRow label="API Key" value="Not configured — zero credentials required in mock mode" />
      <InfoRow label="Model" value="N/A (mock)" />
      <InfoRow label="Note" value="All AI output is labeled MOCK and does not represent real analysis." warn />
    </Section>

    {/* Database */}
    <Section title="Database" icon={<Database size={14} color="var(--teal)" />}>
      <InfoRow label="Engine" value="Supabase PostgreSQL (Active)" />
      <InfoRow label="Project" value="https://ohnwhldqnemjvpjvpclw.supabase.co" />
      <InfoRow label="Region / Mode" value="AWS ap-northeast-2 (IPv4 & IPv6 Dual Pooler)" />
      <InfoRow label="Status" value="Connected · Tables Initialized · Synced" />
    </Section>

    {/* Sandbox */}
    <Section title="Sandbox / Test Execution" icon={<Package size={14} color="var(--accent-rose)" />}>
      <div className="glass-card" style={{ padding: '14px 16px', borderColor: 'rgba(244,63,94,0.3)' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <AlertCircle size={14} color="var(--accent-rose)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-rose)', marginBottom: '4px' }}>
              Sandbox Disabled — Docker Not Available
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Docker is not installed in this environment. Test execution will be marked{' '}
              <code style={{ color: 'var(--accent-amber)' }}>NOT_RUN</code> with reason{' '}
              <code style={{ color: 'var(--accent-amber)' }}>DOCKER_UNAVAILABLE</code>.
              Install Docker and restart the backend to enable isolated test execution.
            </div>
          </div>
        </div>
      </div>
    </Section>

    {/* Security note */}
    <div className="glass-card" style={{ padding: '14px 16px', borderColor: 'rgba(59,130,246,0.2)', marginTop: '8px' }}>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--text-primary)' }}>No secret values are displayed here.</strong>{' '}
        API keys, database passwords, and JWT secrets are never rendered in the Settings UI.
        Configure them via environment variables or a secrets manager.
      </div>
    </div>

    {/* About & Branding */}
    <div className="glass-card" style={{
      padding: '20px',
      marginTop: '20px',
      display: 'flex',
      alignItems: 'center',
      gap: '18px',
      borderColor: '#e2e8f0',
      background: 'linear-gradient(135deg, #f0fdf4 0%, #eff6ff 100%)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    }}>
      <div style={{
        width: '64px',
        height: '64px',
        borderRadius: '14px',
        overflow: 'hidden',
        border: '1px solid #cbd5e1',
        boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
        background: '#ffffff',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <img
          src="/logo-icon.png"
          alt="AgentGuard AI Brand Logo"
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>
      <div>
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
          AgentGuard AI
        </div>
        <div style={{ fontSize: '11px', color: '#0d9488', fontWeight: 700, letterSpacing: '0.6px', marginTop: '2px' }}>
          SCAN · ANALYZE · VERIFY · SECURE
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.5 }}>
          Independent security and quality auditor for AI-generated codebases.
        </div>
      </div>
    </div>
  </div>
);

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div style={{ marginBottom: '20px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
      {icon}
      <h2 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
        {title}
      </h2>
    </div>
    <div className="glass-card" style={{ padding: '0' }}>
      {children}
    </div>
  </div>
);

const InfoRow: React.FC<{ label: string; value: string; warn?: boolean }> = ({ label, value, warn }) => (
  <div style={{
    display: 'flex', alignItems: 'flex-start', gap: '12px',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
  }}>
    <div style={{ fontSize: '12px', color: 'var(--text-muted)', width: '140px', flexShrink: 0, paddingTop: '1px' }}>
      {label}
    </div>
    <div style={{ fontSize: '12px', color: warn ? 'var(--accent-amber)' : 'var(--text-secondary)', flex: 1 }}>
      {value}
    </div>
  </div>
);
