import React from 'react';
import { CurrencyTotals } from '../../types/invoices';
import { formatMoney } from '../../utils/money';

// Under an INR headline figure: the same figure in each other invoice currency, one per line. Currencies are
// never converted or added together (the server sends each one apart).
export const OtherCurrencyTotals: React.FC<{ rows: CurrencyTotals[] | undefined; field: 'outstandingTotal' | 'overdueTotal' }> = ({ rows, field }) => {
  const shown = (rows ?? []).filter(r => r[field] !== '0.00');
  if (shown.length === 0) return null;
  return (
    <span className="block text-[11px] font-mono font-semibold text-[#475569]" data-testid={`other-currencies-${field}`}>
      {shown.map(r => (
        <span key={r.currency} className="block">
          + {formatMoney(r[field], r.currency)}
        </span>
      ))}
    </span>
  );
};
