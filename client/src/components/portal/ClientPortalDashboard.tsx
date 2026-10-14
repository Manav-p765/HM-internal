import React from 'react';
import { Link } from 'react-router';
import { AlertTriangle, CheckCircle2, FolderKanban, Loader } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { portalApi } from '../../api/portal';
import { useApiData } from '../../api/useApiData';
import { Card } from '../common/Card';
import { EmptyState } from '../common/EmptyState';
import { LoadError } from '../common/LoadError';
import { ProgressBar, ProjectStatusBadge } from '../work/WorkBits';

// Client portal home: their projects with progress, and totals over the tasks shared with them.
export const ClientPortalDashboard: React.FC = () => {
  const { user } = useAuth();
  const projects = useApiData(() => portalApi.projects(), []);
  const list = projects.data ?? [];
  const totals = list.reduce(
    (acc, p) => ({
      completed: acc.completed + (p.taskCounts?.completed ?? 0),
      inProgress: acc.inProgress + (p.taskCounts?.inProgress ?? 0),
      overdue: acc.overdue + (p.taskCounts?.overdue ?? 0),
    }),
    { completed: 0, inProgress: 0, overdue: 0 },
  );

  const kpi = (icon: React.ReactNode, label: string, value: number, tone: string) => (
    <Card padding="sm">
      <span className="text-[11px] font-semibold text-[#7185A5] flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className={`text-xl font-mono font-bold mt-1 block ${tone}`}>{projects.data ? value : '—'}</span>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">Welcome</h1>
        <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">
          Hybrid Monks client portal for <span className="font-semibold text-[#111827]">{user?.clientName}</span>.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {kpi(<FolderKanban className="w-3.5 h-3.5" />, 'Active projects', list.length, 'text-[#111827]')}
        {kpi(<CheckCircle2 className="w-3.5 h-3.5" />, 'Tasks completed', totals.completed, 'text-[#047857]')}
        {kpi(<Loader className="w-3.5 h-3.5" />, 'In progress', totals.inProgress, 'text-[#5038F5]')}
        {kpi(<AlertTriangle className="w-3.5 h-3.5" />, 'Overdue', totals.overdue, 'text-[#E11D48]')}
      </div>

      {projects.error ? (
        <Card padding="none">
          <LoadError message={projects.error} onRetry={projects.reload} />
        </Card>
      ) : !projects.data ? (
        <p className="py-10 text-center text-xs text-[#7185A5]" role="status">
          Loading projects...
        </p>
      ) : list.length === 0 ? (
        <Card padding="none">
          <EmptyState icon={<FolderKanban className="w-6 h-6" />} title="No projects yet" description="Projects Hybrid Monks runs for you will appear here." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {list.map(p => (
            <Link key={p.id} to={`/portal/projects/${p.id}`} className="block">
              <Card padding="md" className="space-y-3 hover:border-[#5038F5]/40">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-[#111827]">{p.name}</h3>
                  <ProjectStatusBadge status={p.status} />
                </div>
                <ProgressBar
                  progress={p.progress}
                  label={p.taskCounts ? `${p.taskCounts.completed} of ${p.taskCounts.total} shared tasks done` : 'No shared tasks yet'}
                />
                {p.taskCounts && (
                  <p className="text-[11px] text-[#7185A5]">
                    {p.taskCounts.inProgress} in progress
                    {p.taskCounts.overdue > 0 && <span className="text-[#E11D48]"> · {p.taskCounts.overdue} overdue</span>}
                  </p>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
