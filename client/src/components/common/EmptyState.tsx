import React from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon,
}) => {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 sm:p-12 border border-dashed border-[#DFE6F1] rounded-xl bg-white/50 my-4">
      <div className="w-12 h-12 rounded-xl bg-[#F7F9FC] border border-[#DFE6F1] flex items-center justify-center text-[#7185A5] mb-3.5">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-[#111827]">{title}</h3>
      <p className="text-xs sm:text-sm text-[#7185A5] max-w-md mt-1 mb-5">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button variant="primary" size="md" onClick={onAction} icon={actionIcon}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
