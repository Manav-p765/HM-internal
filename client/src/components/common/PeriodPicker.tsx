import React, { useState } from 'react';
import { PERIOD_PRESET_LABEL, PERIOD_PRESETS, PeriodParams, PeriodPreset } from '../../types/ledger';

const inputClass = 'text-xs px-2.5 py-1.5 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5] min-w-0';

// A report period: one of the server presets (resolved on the server from the IST date and the company's
// financial year) or a custom from/to range. Calls onChange only with a complete period.
export const PeriodPicker: React.FC<{
  value: PeriodParams;
  onChange: (period: PeriodParams) => void;
  className?: string;
}> = ({ value, onChange, className = '' }) => {
  const isCustom = !('preset' in value);
  const [from, setFrom] = useState(isCustom ? value.from : '');
  const [to, setTo] = useState(isCustom ? value.to : '');
  const [custom, setCustom] = useState(isCustom);

  const apply = (f: string, t: string) => {
    if (f && t) onChange({ from: f, to: t });
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <select
        value={custom ? 'custom' : (value as { preset: PeriodPreset }).preset}
        onChange={e => {
          if (e.target.value === 'custom') {
            setCustom(true);
            apply(from, to);
          } else {
            setCustom(false);
            onChange({ preset: e.target.value as PeriodPreset });
          }
        }}
        className={inputClass}
        aria-label="Period"
      >
        {PERIOD_PRESETS.map(p => (
          <option key={p} value={p}>
            {PERIOD_PRESET_LABEL[p]}
          </option>
        ))}
        <option value="custom">Custom range…</option>
      </select>
      {custom && (
        <>
          <input
            type="date"
            value={from}
            onChange={e => {
              setFrom(e.target.value);
              apply(e.target.value, to);
            }}
            className={inputClass}
            aria-label="From"
          />
          <span className="text-xs text-[#7185A5]">to</span>
          <input
            type="date"
            value={to}
            onChange={e => {
              setTo(e.target.value);
              apply(from, e.target.value);
            }}
            className={inputClass}
            aria-label="To"
          />
        </>
      )}
    </div>
  );
};
