import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'error' | 'neutral' | 'purple' | 'info';
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'sm',
  className = '',
}) => {
  const variantStyles = {
    success: 'bg-[#047857]/10 text-[#047857] border-[#047857]/20',
    warning: 'bg-[#B45309]/10 text-[#B45309] border-[#B45309]/20',
    error: 'bg-[#E11D48]/10 text-[#E11D48] border-[#E11D48]/20',
    neutral: 'bg-[#F1F5F9] text-[#475569] border-[#DFE6F1]',
    purple: 'bg-[#5038F5]/10 text-[#5038F5] border-[#5038F5]/20',
    info: 'bg-[#0284C7]/10 text-[#0284C7] border-[#0284C7]/20',
  };

  const sizeStyles = {
    sm: 'text-xs px-2 py-0.5 rounded-md font-medium border',
    md: 'text-xs px-2.5 py-1 rounded-md font-medium border',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {children}
    </span>
  );
};
