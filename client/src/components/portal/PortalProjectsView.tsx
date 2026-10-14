import React, { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Calendar, FolderKanban, MessageSquare, User } from 'lucide-react';
import { portalApi } from '../../api/portal';
import { errorMessage } from '../../api/client';
import { useApiData } from '../../api/useApiData';
import { PortalTask } from '../../types/work';
import { formatDate } from '../../utils/formatters';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { LoadError } from '../common/LoadError';
import { OverdueBadge, ProgressBar, ProjectStatusBadge, TaskStatusBadge, fieldClass, formatDateTime } from '../work/WorkBits';

// /portal/projects: the client's projects.
export const PortalProjectsView: React.FC = () => {
  const projects = useApiData(() => portalApi.projects(), []);
  const list = projects.data ?? [];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">My Projects</h1>
        <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">Progress is based on the tasks shared with you.</p>
      </div>
      {projects.error ? (
        <Card padding="none">
          <LoadError message={projects.error} onRetry={projects.reload} />
        </Card>
      ) : !projects.data ? (
        <p className="py-10 text-center text-xs text-[#7185A5]">Loading projects...</p>
      ) : list.length === 0 ? (
        <Card padding="none">
          <EmptyState icon={<FolderKanban className="w-6 h-6" />} title="No projects yet" description="Projects Hybrid Monks runs for you will appear here." />
        </Card>
      ) : (
        <Card padding="none" className="divide-y divide-[#DFE6F1]">
          {list.map(p => (
            <Link key={p.id} to={`/portal/projects/${p.id}`} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-4 hover:bg-[#F7F9FC]">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#111827]">{p.name}</span>
                  <ProjectStatusBadge status={p.status} />
                </div>
                {p.deadline && (
                  <span className="text-[11px] text-[#7185A5] flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3 h-3" /> Target {formatDate(p.deadline)}
                  </span>
                )}
              </div>
              <div className="sm:w-64">
                <ProgressBar progress={p.progress} label={p.taskCounts ? `${p.taskCounts.completed}/${p.taskCounts.total} tasks` : 'No shared tasks'} />
              </div>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
};

// /portal/projects/:id: shared tasks with their feedback threads.
export const PortalProjectTasksView: React.FC = () => {
  const { id = '' } = useParams();
  const data = useApiData(() => portalApi.projectTasks(id), [id]);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <Link to="/portal/projects" className="text-xs font-semibold text-[#5038F5] flex items-center gap-1 hover:underline">
        <ArrowLeft className="w-3.5 h-3.5" /> All projects
      </Link>
      {data.error ? (
        <Card padding="none">
          <LoadError message={data.error} onRetry={data.reload} />
        </Card>
      ) : !data.data ? (
        <p className="py-10 text-center text-xs text-[#7185A5]">Loading tasks...</p>
      ) : (
        <>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">{data.data.project.name}</h1>
            <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">Tasks the team has shared with you. Leave feedback on any of them.</p>
          </div>
          {data.data.tasks.length === 0 ? (
            <Card padding="none">
              <EmptyState icon={<FolderKanban className="w-6 h-6" />} title="No shared tasks yet" description="The team hasn't shared any tasks on this project yet." />
            </Card>
          ) : (
            <div className="space-y-3">
              {data.data.tasks.map(task => (
                <PortalTaskCard
                  key={task.id}
                  task={task}
                  open={openTaskId === task.id}
                  onToggle={() => setOpenTaskId(openTaskId === task.id ? null : task.id)}
                  onPosted={data.reload}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const PortalTaskCard: React.FC<{ task: PortalTask; open: boolean; onToggle: () => void; onPosted: () => void }> = ({
  task,
  open,
  onToggle,
  onPosted,
}) => (
  <Card padding="none" className="overflow-hidden">
    <button onClick={onToggle} className="w-full text-left px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 hover:bg-[#F7F9FC] cursor-pointer" aria-expanded={open}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-[#111827]">{task.title}</span>
          <span className="font-mono text-[10px] text-[#7185A5]">{task.code}</span>
        </div>
        <div className="flex flex-wrap gap-x-3 text-[11px] text-[#7185A5] mt-0.5">
          {task.assignee && (
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" /> {task.assignee.fullName} · {task.assignee.designation}
            </span>
          )}
          {task.deadline && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Due {formatDate(task.deadline)}
            </span>
          )}
          <span className="flex items-center gap-1">
            <MessageSquare className="w-3 h-3" /> {task.feedbackCount} comment{task.feedbackCount === 1 ? '' : 's'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <TaskStatusBadge status={task.status} />
        {task.overdue && <OverdueBadge />}
      </div>
    </button>
    {open && <PortalTaskThread task={task} onPosted={onPosted} />}
  </Card>
);

const PortalTaskThread: React.FC<{ task: PortalTask; onPosted: () => void }> = ({ task, onPosted }) => {
  const thread = useApiData(() => portalApi.comments(task.id), [task.id]);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [posting, setPosting] = useState(false);

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setPosting(true);
    setError('');
    try {
      await portalApi.addComment(task.id, body.trim());
      setBody('');
      thread.reload();
      onPosted(); // refresh the comment count in the task header
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPosting(false);
    }
  };

  const comments = thread.data ?? [];
  return (
    <div className="border-t border-[#DFE6F1] bg-[#F7F9FC]/60 text-xs">
      {task.description && <p className="px-4 pt-3 text-[#475569] whitespace-pre-line">{task.description}</p>}
      <div className="px-4 py-3 space-y-2">
        {thread.error ? (
          <LoadError message={thread.error} onRetry={thread.reload} />
        ) : comments.length === 0 ? (
          <p className="text-[#7185A5]">{thread.isLoading ? 'Loading…' : 'No comments yet.'}</p>
        ) : (
          comments.map(c => (
            <div key={c.id} className={`p-2.5 rounded-lg border ${c.fromClient ? 'bg-white border-[#DFE6F1]' : 'bg-[#5038F5]/5 border-[#5038F5]/20'}`}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-semibold text-[#111827]">{c.fromClient ? `${c.authorName} (you)` : c.authorName}</span>
                <span className="text-[10px] text-[#7185A5]">{formatDateTime(c.createdAt)}</span>
              </div>
              <p className="text-[#475569] whitespace-pre-line">{c.body}</p>
            </div>
          ))
        )}
      </div>
      <form onSubmit={post} className="px-4 pb-4 space-y-2">
        {error && (
          <p role="alert" className="text-[#E11D48]">
            {error}
          </p>
        )}
        <textarea aria-label={`Feedback on ${task.code}`} rows={2} maxLength={2000} value={body} onChange={e => setBody(e.target.value)} placeholder="Write feedback for the team…" className={fieldClass} />
        <Button type="submit" size="sm" variant="primary" disabled={posting || !body.trim()}>
          {posting ? 'Sending…' : 'Send feedback'}
        </Button>
      </form>
    </div>
  );
};
