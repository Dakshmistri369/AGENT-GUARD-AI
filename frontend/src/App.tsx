import React, { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/layout/Layout';
import { ENABLE_LOGIN_PAGES } from './config/authFeatures';

// Lazy-load LogoIntro so initial page load bundle is not bloated
const LogoIntro = lazy(() => import('./components/brand/LogoIntro').then((m) => ({ default: m.LogoIntro })));

// Code-split page routes so initial bundle is minimal and fast
const OverviewPage = lazy(() => import('./pages/Overview').then((m) => ({ default: m.OverviewPage })));
const ProjectsPage = lazy(() => import('./pages/Projects').then((m) => ({ default: m.ProjectsPage })));
const RepositoriesPage = lazy(() => import('./pages/Repositories').then((m) => ({ default: m.RepositoriesPage })));
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })));
const LoginPage = lazy(() => import('./pages/Login').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('./pages/Register').then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPassword').then((m) => ({ default: m.ForgotPasswordPage })));

const PageLoadingFallback: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', width: '100%' }}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
      <div
        style={{
          width: '32px',
          height: '32px',
          border: '3px solid #e2e8f0',
          borderTopColor: '#2563eb',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Loading AgentGuard...</span>
    </div>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const App: React.FC = () => {
  const [introKey, setIntroKey] = useState<number>(0);
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('agentguard_intro_completed') !== 'true';
  });

  useEffect(() => {
    const handleReplay = () => {
      sessionStorage.removeItem('agentguard_intro_completed');
      localStorage.removeItem('agentguard_intro_seen');
      setIntroKey((k) => k + 1);
      setShowIntro(true);
    };
    window.addEventListener('agentguard:replay-intro', handleReplay);
    return () => window.removeEventListener('agentguard:replay-intro', handleReplay);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {showIntro && (
          <Suspense fallback={null}>
            <LogoIntro
              key={introKey}
              forcePlay={true}
              durationSeconds={3.2}
              onComplete={() => {
                if (typeof window !== 'undefined') {
                  sessionStorage.setItem('agentguard_intro_completed', 'true');
                  localStorage.setItem('agentguard_intro_seen', 'true');
                }
                setShowIntro(false);
              }}
            />
          </Suspense>
        )}
        <BrowserRouter>
          <Suspense fallback={<PageLoadingFallback />}>
            <Routes>
              {/* Public Auth Routes (Preserved - redirects to "/" when login pages are temporarily disabled) */}
              <Route path="/login" element={ENABLE_LOGIN_PAGES ? <LoginPage /> : <Navigate to="/" replace />} />
              <Route path="/register" element={ENABLE_LOGIN_PAGES ? <RegisterPage /> : <Navigate to="/" replace />} />
              <Route path="/forgot-password" element={ENABLE_LOGIN_PAGES ? <ForgotPasswordPage /> : <Navigate to="/" replace />} />

              {/* Protected Application Routes */}
              <Route
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<OverviewPage />} />
                <Route path="/repositories" element={<RepositoriesPage />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/settings" element={<SettingsPage />} />

                {/* Grouped Navigation Links to Repositories & Security Workspaces */}
                <Route path="/findings" element={<Navigate to="/repositories?tab=findings" replace />} />
                <Route path="/history" element={<Navigate to="/repositories?tab=history" replace />} />
                <Route path="/reports" element={<Navigate to="/repositories?tab=solutions" replace />} />
                <Route path="/compare" element={<Navigate to="/repositories?tab=matrix" replace />} />
                <Route path="/assistant" element={<Navigate to="/repositories?tab=ai" replace />} />
                <Route path="/remediation" element={<Navigate to="/repositories?tab=solutions" replace />} />
                <Route path="/rules" element={<Navigate to="/repositories?tab=matrix" replace />} />

                {/* Legacy redirects */}
                <Route path="/new-audit" element={<Navigate to="/repositories?action=new" replace />} />
                <Route path="/gateway" element={<Navigate to="/" replace />} />
                <Route path="/policies" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
