import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export const Layout: React.FC = () => (
  <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
    <Sidebar />
    <main style={{
      flex: 1,
      overflow: 'auto',
      background: 'var(--navy-950)',
    }}>
      <Outlet />
    </main>
  </div>
);
