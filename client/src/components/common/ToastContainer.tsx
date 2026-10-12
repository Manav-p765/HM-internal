import React from 'react';
import { useApp } from '../../context/AppContext';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map(toast => {
        const icons = {
          success: <CheckCircle2 className="w-4 h-4 text-[#047857] shrink-0" />,
          error: <AlertCircle className="w-4 h-4 text-[#E11D48] shrink-0" />,
          info: <Info className="w-4 h-4 text-[#5038F5] shrink-0" />,
        };

        const borderStyles = {
          success: 'border-[#047857]/30 bg-white text-[#111827]',
          error: 'border-[#E11D48]/30 bg-white text-[#111827]',
          info: 'border-[#5038F5]/30 bg-white text-[#111827]',
        };

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-lg ${borderStyles[toast.type]} animate-in slide-in-from-bottom-2 duration-150`}
          >
            <div className="mt-0.5">{icons[toast.type]}</div>
            <div className="flex-1 min-w-0">
              {toast.title && (
                <div className="text-xs font-semibold text-[#111827]">
                  {toast.title}
                </div>
              )}
              <div className="text-xs text-[#475569] leading-snug">
                {toast.message}
              </div>
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              className="text-[#94A3B8] hover:text-[#111827] p-1 transition-colors rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
