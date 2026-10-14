import React from 'react';
import { Link } from 'react-router';
import { tasksApi } from '../../api/tasks';
import { useApiData } from '../../api/useApiData';
import { Card } from '../common/Card';

// Task KPIs from GET /api/tasks/summary (admin/manager: every task; employee: their own).
export const TaskKpis: React.FC<{ title: string; linkTo: string }> = ({ title, linkTo }) => {
  const summary = useApiData(() => tasksApi.summary(), []);
  const s = summary.data;
  const items: [string, number | undefined, string][] = [
    ['Total', s?.total, 'text-[#111827]'],
    ['In progress', s?.inProgress, 'text-[#5038F5]'],
    ['In review', s?.inReview, 'text-[#7C3AED]'],
    ['Completed', s?.completed, 'text-[#047857]'],
    ['Overdue', s?.overdue, 'text-[#E11D48]'],
    ['Blocked', s?.blocked, 'text-[#B45309]'],
  ];
  return (
    <Card padding="md" aria-label={title}>
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#DFE6F1]">
        <h3 className="text-sm font-bold text-[#111827]">{title}</h3>
        <Link to={linkTo} className="text-xs font-semibold text-[#5038F5] hover:underline">
          Open tasks
        </Link>
      </div>
      {summary.error ? (
        <p className="text-xs text-[#E11D48]">{summary.error}</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {items.map(([label, value, tone]) => (
            <div key={label} data-kpi={label}>
              <span className="text-[11px] text-[#7185A5] block">{label}</span>
              <span className={`text-lg font-mono font-bold ${tone}`}>{value ?? '—'}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
