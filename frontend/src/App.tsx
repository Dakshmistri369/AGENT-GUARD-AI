import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { OverviewPage } from './pages/Overview';
import { ProjectsPage } from './pages/Projects';
import { RepositoriesPage } from './pages/Repositories';
import { SettingsPage } from './pages/Settings';

const App: React.FC = () => (
  <BrowserRouter>
    <Routes>
      <Route element={<Layout />}>
        <Route path="/"             element={<OverviewPage />} />
        <Route path="/repositories" element={<RepositoriesPage />} />
        <Route path="/projects"     element={<ProjectsPage />} />
        <Route path="/settings"     element={<SettingsPage />} />
        {/* Direct redirects to Repositories tabs */}
        <Route path="/new-audit" element={<Navigate to="/repositories" replace />} />
        <Route path="/findings"  element={<Navigate to="/repositories?tab=findings" replace />} />
        <Route path="/history"   element={<Navigate to="/repositories?tab=history" replace />} />
        <Route path="/gateway"   element={<Navigate to="/" replace />} />
        <Route path="/policies"  element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  </BrowserRouter>
);

export default App;
