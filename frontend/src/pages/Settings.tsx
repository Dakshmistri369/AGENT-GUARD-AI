import React, { useEffect, useState } from 'react';
import { Settings as SettingsIcon, AlertCircle, Shield, Cpu, Database, Package, Sparkles, LogOut, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageContainer } from '../components/ui/PageContainer';
import { AnimatedBrandLogo } from '../components/brand/AnimatedBrandLogo';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { SHOW_SIGN_IN_BUTTON } from '../config/authFeatures';

interface BackendUserProfile {
  id: number;
  email: string;
  supabase_user_id?: string;
  email_verified: boolean;
  auth_status: string;
  created_at: string;
}

export const SettingsPage: React.FC = () => {
  const { user, signOut, isConfigured } = useAuth();
  const [profile, setProfile] = useState<BackendUserProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true);

  useEffect(() => {
    setIsLoadingAuth(true);
    api.auth.me()
      .then((data) => {
        setProfile(data);
        setAuthError(null);
      })
      .catch((err) => {
        setProfile(null);
        if (err.response?.status === 401) {
          setAuthError('401 Unauthorized — No valid Bearer token detected by backend.');
        } else {
          setAuthError(`Connection error: ${err.message || 'Unknown error'}`);
        }
      })
      .finally(() => {
        setIsLoadingAuth(false);
      });
  }, [user]);

  return (
    <PageContainer>
      <div className="flex items-center gap-2.5">
        <SettingsIcon size={22} className="text-blue-600" />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
      </div>

      {/* Auth mode */}
      <Section title="Authentication" icon={<Shield size={14} color="var(--accent-amber)" />}>
        <InfoRow
          label="Auth Mode"
          value={
            profile?.auth_status === 'VERIFIED'
              ? 'Supabase JWT Auth (Active)'
              : isConfigured
              ? 'Supabase Auth (Unauthenticated / Session Expired)'
              : 'DEMO — No Real Auth Active (Phase 1 Stub)'
          }
          warn={profile?.auth_status !== 'VERIFIED'}
        />
        <InfoRow
          label="Current User"
          value={
            profile?.email
              ? `${profile.email} (${profile.supabase_user_id ? `UUID: ${profile.supabase_user_id.slice(0, 12)}...` : 'Local ID: ' + profile.id})`
              : user?.email
              ? `${user.email} (Pending backend sync)`
              : 'demo@agentguard.local (seeded fallback)'
          }
          warn={!profile || profile.email === 'demo@agentguard.local'}
        />
        <InfoRow
          label="Backend JWT Verification"
          value={
            isLoadingAuth
              ? 'Verifying JWT with backend...'
              : profile?.auth_status === 'VERIFIED'
              ? 'VERIFIED (HTTP 200 OK from /api/auth/me)'
              : authError || 'NOT VERIFIED'
          }
          warn={profile?.auth_status !== 'VERIFIED'}
        />
        {user ? (
          <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => signOut()}
              className="btn btn-secondary"
              style={{
                fontSize: '12px',
                padding: '6px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: 'var(--accent-rose)',
              }}
            >
              <LogOut size={13} />
              Sign Out
            </button>
          </div>
        ) : isConfigured && SHOW_SIGN_IN_BUTTON ? (
          <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
            <Link
              to="/login"
              className="btn-primary"
              style={{
                fontSize: '12px',
                padding: '6px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                textDecoration: 'none',
              }}
            >
              Sign In
              <ArrowRight size={13} />
            </Link>
          </div>
        ) : null}
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
        <InfoRow label="Project" value="Connected Supabase Cloud Project" />
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
        padding: '24px',
        marginTop: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        borderColor: '#e2e8f0',
        background: '#ffffff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <AnimatedBrandLogo variant="full" size="lg" />
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.6 }}>
          Independent security and quality auditor for AI-generated and human-written codebases.
          Continuous static analysis, credential scanning, and vulnerability detection powered by Semgrep, Bandit, detect-secrets, and OSV API.
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: '12px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => {
              sessionStorage.removeItem('agentguard_intro_completed');
              window.dispatchEvent(new CustomEvent('agentguard:replay-intro'));
            }}
          >
            <Sparkles size={13} color="var(--teal)" />
            Replay Cinematic Startup Intro
          </button>
        </div>
      </div>
    </PageContainer>
  );
};

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
  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 p-3 sm:p-4 border-b border-[var(--border)]">
    <div className="text-xs text-[var(--text-muted)] w-full sm:w-44 flex-shrink-0 pt-0.5 font-medium">
      {label}
    </div>
    <div style={{ color: warn ? 'var(--accent-amber)' : 'var(--text-secondary)' }} className="text-xs flex-1 break-words">
      {value}
    </div>
  </div>
);
