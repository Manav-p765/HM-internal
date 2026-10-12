import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  className = '',
  disabled,
  ...props
}) => {
  const base =
    'inline-flex items-center justify-center font-medium rounded-lg transition-colors cursor-pointer select-none whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5038F5]/30';

  const variants = {
    primary: 'bg-[#5038F5] text-white hover:bg-[#4328E8] active:bg-[#381ee0] shadow-sm',
    secondary: 'bg-[#F1F5F9] text-[#111827] hover:bg-[#E2E8F0] active:bg-[#CBD5E1]',
    outline: 'border border-[#DFE6F1] bg-white text-[#111827] hover:bg-[#F8FAFC] active:bg-[#F1F5F9]',
    danger: 'bg-[#E11D48] text-white hover:bg-[#BE123C] active:bg-[#9F1239]',
    ghost: 'text-[#475569] hover:text-[#111827] hover:bg-[#F1F5F9]',
  };

  const sizes = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5',
    md: 'text-sm px-3.5 py-2 gap-2',
    lg: 'text-sm px-4 py-2.5 gap-2.5',
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
};
