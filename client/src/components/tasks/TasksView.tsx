import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Columns3, ListChecks, Plus, Search, Table2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { tasksApi, TaskListParams } from '../../api/tasks';
import { projectsApi } from '../../api/projects';
import { employeesApi } from '../../api/employees';
import { useApiData } from '../../api/useApiData';
import { Task, TASK_PRIORITIES, TASK_PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL, TaskPriority, TaskStatus } from '../../types/work';
import { formatDate } from '../../utils/formatters';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { LoadError } from '../common/LoadError';
import { TaskModal } from './TaskModal';
import { TaskDetailModal } from './TaskDetailModal';
import { TaskStatusControl } from '../work/TaskStatusControl';
import { OverdueBadge, PriorityBadge, TaskStatusBadge, fieldClass } from '../work/WorkBits';

const PAGE_SIZE = 50;
const VIEW_KEY = 'hm.tasks.view'; // per-viewer convenience only

interface TasksViewProps {
  // 'staff' = /tasks (admin, manager: every task); 'mine' = /my/tasks (an employee's own tasks).
  mode?: 'staff' | 'mine';
}

export const TasksView: React.FC<TasksViewProps> = ({ mode = 'staff' }) => {
  const { currentUser } = useApp();
  const isManager = currentUser.role === 'admin' || currentUser.role === 'manager';
  const basePath = mode === 'mine' ? '/my/tasks' : '/tasks';
  const navigate = useNavigate();
  const { id: viewId } = useParams();
  const [searchParams] = useSearchParams();

  const [view, setView] = useState<'table' | 'board'>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'board';
    } catch {
      return 'board';
    }
  });
  const switchView = (next: 'table' | 'board') => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // storage unavailable: the choice just isn't remembered
    }
  };

  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState<TaskListParams>({ projectId: searchParams.get('projectId') ?? undefined });
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters(f => ({ ...f, search: searchInput.trim() || undefined }));
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);
  const setFilter = (patch: TaskListParams) => {
    setFilters(f => ({ ...f, ...patch }));
    setOffset(0);
  };

  // The board shows every matching task (up to 200); the table pages.
  const limit = view === 'board' ? 200 : PAGE_SIZE;
  const list = useApiData(() => tasksApi.list({ ...filters, limit, offset: view === 'board' ? 0 : offset }), [filters, offset, view]);
  const tasks = list.data?.tasks ?? [];
  const total = list.data?.total ?? 0;

  // Filter options (staff only)
  const projects = useApiData(() => (isManager ? projectsApi.list({ limit: 200 }).then(r => r.projects) : Promise.resolve([])), [isManager]);
  const employees = useApiData(
    () => (isManager ? employeesApi.list({ status: 'active', limit: 200 }).then(r => r.employees) : Promise.resolve([])),
    [isManager],
  );

  const [modal, setModal] = useState<{ open: boolean; task: Task | null }>({ open: false, task: null });
  const { showToast } = useApp();

  const replaceTask = (updated: Task) =>
    list.setData(current => (current ? { ...current, tasks: current.tasks.map(t => (t.id === updated.id ? updated : t)) } : current!));

  const hasFilters = Object.values(filters).some(v => v !== undefined && v !== '');

  const header = (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">{mode === 'mine' ? 'My Tasks' : 'Tasks'}</h1>
        <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">
          {mode === 'mine' ? 'Tasks assigned to you. Move them along as you work.' : 'Every task across projects'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex p-1 bg-white border border-[#DFE6F1] rounded-lg">
          <button
            onClick={() => switchView('board')}
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 cursor-pointer ${view === 'board' ? 'bg-[#5038F5] text-white' : 'text-[#7185A5]'}`}
            aria-pressed={view === 'board'}
          >
            <Columns3 className="w-3.5 h-3.5" /> Board
          </button>
          <button
            onClick={() => switchView('table')}
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 cursor-pointer ${view === 'table' ? 'bg-[#5038F5] text-white' : 'text-[#7185A5]'}`}
            aria-pressed={view === 'table'}
          >
            <Table2 className="w-3.5 h-3.5" /> Table
          </button>
        </div>
        {isManager && mode === 'staff' && (
          <Button variant="primary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setModal({ open: true, task: null })}>
            Add Task
          </Button>
        )}
      </div>
    </div>
  );

  const filterBar = (
    <Card padding="sm">
      <div className={`grid grid-cols-1 gap-3 ${isManager ? 'sm:grid-cols-6' : 'sm:grid-cols-4'}`}>
        <div className="relative sm:col-span-2">
          <Search className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            aria-label="Search tasks"
            placeholder="Search title or code…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className={`${fieldClass} pl-9`}
          />
        </div>
        {isManager && (
          <select aria-label="Filter by project" value={filters.projectId ?? ''} onChange={e => setFilter({ projectId: e.target.value || undefined })} className={fieldClass}>
            <option value="">All projects</option>
            {(projects.data ?? []).map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        {isManager && (
          <select aria-label="Filter by assignee" value={filters.assigneeId ?? ''} onChange={e => setFilter({ assigneeId: e.target.value || undefined })} className={fieldClass}>
            <option value="">All assignees</option>
            <option value="unassigned">Unassigned</option>
            {(employees.data ?? []).map(e => (
              <option key={e.id} value={e.id}>
                {e.fullName}
              </option>
            ))}
          </select>
        )}
        <select aria-label="Filter by priority" value={filters.priority ?? ''} onChange={e => setFilter({ priority: (e.target.value || undefined) as TaskPriority | undefined })} className={fieldClass}>
          <option value="">All priorities</option>
          {TASK_PRIORITIES.map(p => (
            <option key={p} value={p}>
              {TASK_PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          value={filters.overdue ? 'overdue' : (filters.status ?? '')}
          onChange={e => {
            const v = e.target.value;
            setFilter(v === 'overdue' ? { overdue: true, status: undefined } : { overdue: undefined, status: (v || undefined) as TaskStatus | undefined });
          }}
          className={fieldClass}
        >
          <option value="">All statuses</option>
          {TASK_STATUSES.map(s => (
            <option key={s} value={s}>
              {TASK_STATUS_LABEL[s]}
            </option>
          ))}
          <option value="overdue">Overdue only</option>
        </select>
      </div>
    </Card>
  );

  const open = (task: Task) => navigate(`${basePath}/${task.id}`);

  const body = list.error ? (
    <Card padding="none">
      <LoadError message={list.error} onRetry={list.reload} />
    </Card>
  ) : list.isLoading && !list.data ? (
    <p className="py-12 text-center text-xs text-[#7185A5]" role="status">
      Loading tasks...
    </p>
  ) : tasks.length === 0 ? (
    <Card padding="none">
      <EmptyState
        icon={<ListChecks className="w-6 h-6" />}
        title={hasFilters ? 'No tasks match' : mode === 'mine' ? 'Nothing assigned to you' : 'No tasks yet'}
        description={hasFilters ? 'Try different filters.' : mode === 'mine' ? 'Tasks assigned to you will appear here.' : 'Create a task inside a project.'}
      />
    </Card>
  ) : view === 'board' ? (
    <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3 items-start">
      {TASK_STATUSES.map(status => {
        const column = tasks.filter(t => t.status === status);
        return (
          <section key={status} aria-label={TASK_STATUS_LABEL[status]} className="bg-[#F1F5F9]/70 rounded-xl p-2.5 space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-[#111827]">{TASK_STATUS_LABEL[status]}</span>
              <span className="text-[11px] font-mono text-[#7185A5]">{column.length}</span>
            </div>
            {column.map(task => (
              <div
                key={task.id}
                data-task-card={task.code}
                onClick={() => open(task)}
                className="bg-white rounded-lg border border-[#DFE6F1] p-3 space-y-2 cursor-pointer hover:border-[#5038F5]/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold text-[#111827] leading-snug">{task.title}</span>
                  <span className="font-mono text-[10px] text-[#7185A5] shrink-0">{task.code}</span>
                </div>
                <p className="text-[11px] text-[#7185A5] truncate">{task.projectName}</p>
                <div className="flex flex-wrap gap-1">
                  <PriorityBadge priority={task.priority} />
                  {task.overdue && <OverdueBadge />}
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#475569]">
                  <span>{task.assignee?.fullName ?? 'Unassigned'}</span>
                  <span>{task.deadline ? formatDate(task.deadline) : ''}</span>
                </div>
                <TaskStatusControl task={task} compact onChanged={replaceTask} />
              </div>
            ))}
          </section>
        );
      })}
    </div>
  ) : (
    <Card padding="none" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[#7185A5] font-semibold">
            <tr>
              <th className="py-3 px-4">Task</th>
              <th className="py-3 px-4">Project</th>
              {mode === 'staff' && <th className="py-3 px-4">Assignee</th>}
              <th className="py-3 px-4">Priority</th>
              <th className="py-3 px-4">Deadline</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DFE6F1]">
            {tasks.map(task => (
              <tr key={task.id} className="hover:bg-[#F7F9FC]/60 cursor-pointer" onClick={() => open(task)}>
                <td className="py-3 px-4">
                  <div className="font-semibold text-[#111827]">{task.title}</div>
                  <div className="font-mono text-[10px] text-[#7185A5]">{task.code}</div>
                </td>
                <td className="py-3 px-4 text-[#475569]">{task.projectName}</td>
                {mode === 'staff' && <td className="py-3 px-4 text-[#475569]">{task.assignee?.fullName ?? 'Unassigned'}</td>}
                <td className="py-3 px-4">
                  <PriorityBadge priority={task.priority} />
                </td>
                <td className="py-3 px-4 whitespace-nowrap text-[#475569]">
                  {task.deadline ? formatDate(task.deadline) : '—'} {task.overdue && <OverdueBadge />}
                </td>
                <td className="py-3 px-4">
                  <TaskStatusBadge status={task.status} />
                </td>
                <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                  <TaskStatusControl task={task} compact onChanged={replaceTask} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#DFE6F1] text-xs text-[#7185A5]">
          <span>
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={<ChevronLeft className="w-3.5 h-3.5" />} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>
              Next <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );

  return (
    <div className="space-y-6">
      {header}
      {filterBar}
      {view === 'board' && total > 200 && (
        <p className="text-[11px] text-[#B45309]">Showing the first 200 of {total} tasks. Narrow the filters or use the table.</p>
      )}
      {body}

      {isManager && (
        <TaskModal
          isOpen={modal.open}
          onClose={() => setModal({ open: false, task: null })}
          taskToEdit={modal.task}
          defaultProjectId={filters.projectId}
          onSaved={(saved, created) => {
            showToast('success', created ? `${saved.code} created` : `${saved.code} updated`);
            list.reload();
          }}
        />
      )}

      {viewId && (
        <TaskDetailModal
          taskId={viewId}
          onClose={() => navigate(basePath)}
          onChanged={list.reload}
          onEdit={isManager ? task => setModal({ open: true, task }) : undefined}
          onDeleted={() => {
            navigate(basePath);
            list.reload();
          }}
        />
      )}
    </div>
  );
};

export const EmployeeTasksView: React.FC = () => <TasksView mode="mine" />;
