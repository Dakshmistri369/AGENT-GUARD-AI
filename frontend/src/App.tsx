import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/layout/Layout';
import { OverviewPage } from './pages/Overview';
import { ProjectsPage } from './pages/Projects';
import { RepositoriesPage } from './pages/Repositories';
import { SettingsPage } from './pages/Settings';
import { LoginPage } from './pages/Login';
import { RegisterPage } from './pages/Register';
import { ForgotPasswordPage } from './pages/ForgotPassword';
import { LogoIntro } from './components/brand/LogoIntro';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 15, // 15 seconds
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const App: React.FC = () => {
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('agentguard_intro_completed') !== 'true';
  });

  useEffect(() => {
    const handleReplay = () => setShowIntro(true);
    window.addEventListener('agentguard:replay-intro', handleReplay);
    return () => window.removeEventListener('agentguard:replay-intro', handleReplay);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {showIntro && (
          <LogoIntro
            forcePlay={true}
            onComplete={() => setShowIntro(false)}
          />
        )}
        <BrowserRouter>
          <Routes>
            {/* Public Auth Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />

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
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
