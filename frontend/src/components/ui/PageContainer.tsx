import React from 'react';

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: string;
}

/**
 * Standard AgentGuard Page Container:
 * Applies consistent horizontal padding (px-4 sm:px-6 lg:px-8),
 * max width constraint (max-w-7xl), consistent vertical rhythm (space-y-6 / py-6),
 * and prevents horizontal overflow (min-w-0 overflow-x-hidden).
 */
export const PageContainer: React.FC<PageContainerProps> = ({
  children,
  className = '',
  maxWidth = 'max-w-7xl',
}) => {
  return (
    <div
      className={`mx-auto w-full ${maxWidth} px-4 sm:px-6 lg:px-8 py-6 space-y-6 min-w-0 overflow-x-hidden pb-safe ${className}`}
    >
      {children}
    </div>
  );
};
