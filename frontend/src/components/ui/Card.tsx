import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingStyles = {
  none: '',
  sm: 'p-3.5 sm:p-4',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-6',
};

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  padding = 'md',
  ...props
}) => {
  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl shadow-xs transition-shadow duration-150 ${paddingStyles[padding]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
