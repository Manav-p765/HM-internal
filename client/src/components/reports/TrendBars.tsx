import React from 'react';
import { TrendMonth } from '../../types/ledger';
import { formatMoney, maxAmount, sharePercent } from '../../utils/money';
import { formatMonthYear } from '../../utils/formatters';

const shortMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
};

// Income vs expense per month as pure-CSS bars (heights scaled to the largest amount; display only), with
// the same server figures in a table below for screen readers and precision.
export const TrendBars: React.FC<{ months: TrendMonth[]; showTable?: boolean; testId?: string }> = ({ months, showTable = true, testId }) => {
  const max = maxAmount(months.flatMap(m => [m.income, m.expense]));
  return (
    <div className="space-y-4" data-testid={testId}>
      <div className="flex items-center gap-4 text-xs font-medium" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#5038F5]" /> Income
        </span>
        <span className="flex items-center gap-1.5 text-[#7185A5]">
          <span className="w-3 h-3 rounded-sm bg-[#F59E0B]" /> Expenses
        </span>
      </div>
      <div
        className="grid gap-1 sm:gap-3 items-end h-44 pt-2 border-b border-[#DFE6F1]"
        style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}
        aria-hidden
      >
        {months.map(m => (
          <div key={m.month} className="flex flex-col items-center h-full justify-end min-w-0" data-testid={`trend-bar-${m.month}`}>
            <div className="w-full flex items-end justify-center gap-0.5 sm:gap-1 h-full">
              <div
                className="w-1/2 max-w-[24px] bg-[#5038F5] rounded-t"
                style={{ height: `${sharePercent(m.income, max)}%`, minHeight: m.income === '0.00' ? 0 : 2 }}
                title={`${formatMonthYear(m.month)} income ${formatMoney(m.income)}`}
                data-value={m.income}
              />
              <div
                className="w-1/2 max-w-[24px] bg-[#F59E0B] rounded-t"
                style={{ height: `${sharePercent(m.expense, max)}%`, minHeight: m.expense === '0.00' ? 0 : 2 }}
                title={`${formatMonthYear(m.month)} expenses ${formatMoney(m.expense)}`}
                data-value={m.expense}
              />
            </div>
            <span className="text-[10px] sm:text-[11px] font-semibold text-[#7185A5] mt-1.5">{shortMonth(m.month)}</span>
          </div>
        ))}
      </div>
      {showTable && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[10px] sm:text-xs" data-testid={testId ? `${testId}-table` : undefined}>
            <caption className="sr-only">Income, expenses and net by month</caption>
            <thead className="text-[#7185A5] border-b border-[#DFE6F1]">
              <tr>
                <th className="py-2 pr-1.5 sm:pr-3 font-semibold">Month</th>
                <th className="py-2 px-1.5 sm:px-3 font-semibold text-right">Income</th>
                <th className="py-2 px-1.5 sm:px-3 font-semibold text-right">Expenses</th>
                <th className="py-2 pl-1.5 sm:pl-3 font-semibold text-right">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DFE6F1]">
              {months.map(m => (
                <tr key={m.month}>
                  <td className="py-2 pr-1.5 sm:pr-3 font-medium text-[#111827] whitespace-nowrap">
                    <span className="sm:hidden">{shortMonth(m.month)} {m.month.slice(2, 4)}</span>
                    <span className="hidden sm:inline">{formatMonthYear(m.month)}</span>
                  </td>
                  <td className="py-2 px-1.5 sm:px-3 text-right font-mono text-[#047857] whitespace-nowrap">{formatMoney(m.income)}</td>
                  <td className="py-2 px-1.5 sm:px-3 text-right font-mono text-[#B45309] whitespace-nowrap">{formatMoney(m.expense)}</td>
                  <td className={`py-2 pl-1.5 sm:pl-3 text-right font-mono font-semibold whitespace-nowrap ${m.net.startsWith('-') ? 'text-[#E11D48]' : 'text-[#111827]'}`}>
                    {formatMoney(m.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
