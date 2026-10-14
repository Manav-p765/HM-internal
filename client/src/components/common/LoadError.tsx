import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from './Button';

// Shown in place of a page section whose data failed to load.
export const LoadError: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div className="py-10 px-6 flex flex-col items-center text-center" role="alert">
    <div className="w-10 h-10 rounded-xl bg-[#E11D48]/10 text-[#E11D48] flex items-center justify-center mb-3">
      <AlertCircle className="w-5 h-5" />
    </div>
    <p className="text-xs text-[#E11D48] mb-3 max-w-sm">{message}</p>
    {onRetry && (
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    )}
  </div>
);
