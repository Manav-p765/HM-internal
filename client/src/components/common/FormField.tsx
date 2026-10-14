import React from 'react';

export interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  hint?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  required,
  children,
  className = '',
  hint,
}) => {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="block text-xs font-semibold text-[#111827]">
        {label}
        {required && <span className="text-[#E11D48] ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="text-[11px] text-[#7185A5] mt-0.5">{hint}</p>
      )}
      {error && (
        <p className="text-[11px] text-[#E11D48] font-medium mt-0.5">{error}</p>
      )}
    </div>
  );
};
