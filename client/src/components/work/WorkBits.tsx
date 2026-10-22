import React from 'react';
import { Badge } from '../common/Badge';
import {
  PROJECT_STATUS_LABEL,
  ProjectStatus,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  TaskPriority,
  TaskStatus,
} from '../../types/work';

type Variant = 'success' | 'warning' | 'error' | 'danger' | 'neutral' | 'purple' | 'info';

const TASK_STATUS_VARIANT: Record<TaskStatus, Variant> = {
  todo: 'neutral',
  in_progress: 'info',
  in_review: 'purple',
  completed: 'success',
  blocked: 'danger',
};
const PRIORITY_VARIANT: Record<TaskPriority, Variant> = { low: 'neutral', medium: 'info', high: 'warning', urgent: 'danger' };
const PROJECT_STATUS_VARIANT: Record<ProjectStatus, Variant> = {
  not_started: 'neutral',
  active: 'info',
  on_hold: 'warning',
  completed: 'success',
  archived: 'neutral',
};

export const TaskStatusBadge: React.FC<{ status: TaskStatus }> = ({ status }) => (
  <Badge variant={TASK_STATUS_VARIANT[status]} size="sm">
    {TASK_STATUS_LABEL[status]}
  </Badge>
);

export const PriorityBadge: React.FC<{ priority: TaskPriority }> = ({ priority }) => (
  <Badge variant={PRIORITY_VARIANT[priority]} size="sm">
    {TASK_PRIORITY_LABEL[priority]}
  </Badge>
);

export const ProjectStatusBadge: React.FC<{ status: ProjectStatus }> = ({ status }) => (
  <Badge variant={PROJECT_STATUS_VARIANT[status]} size="sm">
    {PROJECT_STATUS_LABEL[status]}
  </Badge>
);

export const OverdueBadge: React.FC = () => (
  <Badge variant="danger" size="sm">
    Overdue
  </Badge>
);

// A task the client asked for in the portal (it always stays shared with them).
export const ClientRequestBadge: React.FC = () => (
  <Badge variant="purple" size="sm">
    Client request
  </Badge>
);

// progress is 0..1, or null when there is nothing to measure.
export const ProgressBar: React.FC<{ progress: number | null; label?: string }> = ({ progress, label }) => {
  const pct = progress === null ? 0 : Math.round(progress * 100);
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-[11px] text-[#7185A5] mb-1">
        <span>{label ?? 'Progress'}</span>
        <span className="font-mono font-semibold text-[#111827]">{progress === null ? '—' : `${pct}%`}</span>
      </div>
      <div
        className="h-1.5 rounded-full bg-[#F1F5F9] overflow-hidden"
        role="progressbar"
        aria-valuenow={progress === null ? undefined : pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progress'}
      >
        <div className="h-full bg-[#5038F5] rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

export const fieldClass =
  'w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]';

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
