import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Archive, ArchiveRestore, Building2, Calendar, Edit2, FolderKanban, Plus, Search, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { projectsApi, ProjectListParams } from '../../api/projects';
import { tasksApi } from '../../api/tasks';
import { clientsApi } from '../../api/clients';
import { errorMessage } from '../../api/client';
import { useApiData } from '../../api/useApiData';
import { PROJECT_STATUS_LABEL, Project, ProjectStatus } from '../../types/work';
import { formatDate } from '../../utils/formatters';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { LoadError } from '../common/LoadError';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { ProjectModal } from './ProjectModal';
import { TaskModal } from '../tasks/TaskModal';
import { OverdueBadge, PriorityBadge, ProgressBar, ProjectStatusBadge, TaskStatusBadge, fieldClass } from '../work/WorkBits';

interface ProjectsViewProps {
  // 'staff' = /projects (admin, manager); 'mine' = /my/projects (an employee's projects, read-only)
  mode?: 'staff' | 'mine';
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({ mode = 'staff' }) => {
  const { currentUser, showToast } = useApp();
  const isManager = mode === 'staff' && (currentUser.role === 'admin' || currentUser.role === 'manager');
  const basePath = mode === 'mine' ? '/my/projects' : '/projects';
  const navigate = useNavigate();
  const { id: viewId } = useParams();

  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState<ProjectListParams>({});
  useEffect(() => {
    const t = setTimeout(() => setFilters(f => ({ ...f, search: searchInput.trim() || undefined })), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const list = useApiData(() => projectsApi.list({ ...filters, limit: 200 }), [filters]);
  const clients = useApiData(() => (isManager ? clientsApi.list({ limit: 200 }).then(r => r.clients) : Promise.resolve([])), [isManager]);
  const projects = list.data?.projects ?? [];

  const [modal, setModal] = useState<{ open: boolean; project: Project | null }>({ open: false, project: null });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">{mode === 'mine' ? 'My Projects' : 'Projects'}</h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">
            {mode === 'mine' ? 'Projects you are a member of' : 'Client and internal projects, their teams and progress'}
          </p>
        </div>
        {isManager && (
          <Button variant="primary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setModal({ open: true, project: null })}>
            Add Project
          </Button>
        )}
      </div>

      <Card padding="sm">
        <div className={`grid grid-cols-1 gap-3 ${isManager ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="search" aria-label="Search projects" placeholder="Search project or client…" value={searchInput} onChange={e => setSearchInput(e.target.value)} className={`${fieldClass} pl-9`} />
          </div>
          <select
            aria-label="Filter by status"
            value={filters.status ?? (filters.includeArchived ? 'all' : '')}
            onChange={e => {
              const v = e.target.value;
              setFilters(f => ({ ...f, status: v && v !== 'all' ? (v as ProjectStatus) : undefined, includeArchived: v === 'all' || undefined }));
            }}
            className={fieldClass}
          >
            <option value="">Current (not archived)</option>
            {(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map(s => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABEL[s]}
              </option>
            ))}
            <option value="all">All, including archived</option>
          </select>
          {isManager && (
            <select aria-label="Filter by client" value={filters.clientId ?? ''} onChange={e => setFilters(f => ({ ...f, clientId: e.target.value || undefined }))} className={fieldClass}>
              <option value="">All clients</option>
              <option value="internal">Internal only</option>
              {(clients.data ?? []).map(c => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </select>
          )}
        </div>
      </Card>

      {list.error ? (
        <Card padding="none">
          <LoadError message={list.error} onRetry={list.reload} />
        </Card>
      ) : list.isLoading && !list.data ? (
        <p className="py-12 text-center text-xs text-[#7185A5]" role="status">
          Loading projects...
        </p>
      ) : projects.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<FolderKanban className="w-6 h-6" />}
            title="No projects"
            description={mode === 'mine' ? "You aren't on any project team yet." : 'Create a project to start planning tasks.'}
            actionLabel={isManager ? 'Add Project' : undefined}
            onAction={() => setModal({ open: true, project: null })}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map(p => (
            <Card key={p.id} padding="md" className="flex flex-col gap-3 cursor-pointer hover:border-[#5038F5]/40">
              <div onClick={() => navigate(`${basePath}/${p.id}`)} className="space-y-3" role="button" aria-label={`Open ${p.name}`}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-[#111827]">{p.name}</h3>
                  <ProjectStatusBadge status={p.status} />
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#7185A5]">
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" /> {p.clientName ?? 'Internal'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> {p.memberCount} member{p.memberCount === 1 ? '' : 's'}
                  </span>
                  {p.deadline && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" /> {formatDate(p.deadline)}
                    </span>
                  )}
                </div>
                <ProgressBar progress={p.progress} label={`${p.completedTaskCount} of ${p.taskCount} tasks done`} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {isManager && (
        <ProjectModal
          isOpen={modal.open}
          onClose={() => setModal({ open: false, project: null })}
          projectToEdit={modal.project}
          onSaved={(saved, created) => {
            showToast('success', created ? `${saved.name} created` : `${saved.name} updated`);
            list.reload();
            if (created) navigate(`/projects/${saved.id}`);
          }}
        />
      )}

      {viewId && (
        <ProjectDetailModal
          projectId={viewId}
          canManage={isManager}
          onClose={() => navigate(basePath)}
          onChanged={list.reload}
          onEdit={project => setModal({ open: true, project })}
        />
      )}
    </div>
  );
};

export const EmployeeProjectsView: React.FC = () => <ProjectsView mode="mine" />;

// ---------------------------------------------------------------------------
// Project detail: team, tasks, and (for admin/manager) edit / add task / archive
// ---------------------------------------------------------------------------
interface ProjectDetailModalProps {
  projectId: string;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (project: Project) => void;
}

const ProjectDetailModal: React.FC<ProjectDetailModalProps> = ({ projectId, canManage, onClose, onChanged, onEdit }) => {
  const { showToast } = useApp();
  const navigate = useNavigate();
  const detail = useApiData(() => projectsApi.get(projectId), [projectId]);
  const tasks = useApiData(() => tasksApi.list({ projectId, limit: 200 }).then(r => r.tasks), [projectId]);
  const project = detail.data?.id === projectId ? detail.data : undefined;
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const refresh = () => {
    detail.reload();
    tasks.reload();
    onChanged();
  };

  const toggleArchive = async () => {
    if (!project) return;
    setConfirmArchive(false);
    try {
      const updated = project.status === 'archived' ? await projectsApi.unarchive(project.id) : await projectsApi.archive(project.id);
      showToast('success', updated.status === 'archived' ? `${project.name} archived` : `${project.name} restored`);
      refresh();
    } catch (err) {
      showToast('error', errorMessage(err));
    }
  };

  if (!project) {
    return (
      <Modal isOpen onClose={onClose} title="Project" size="4xl">
        {detail.error ? <LoadError message={detail.error} onRetry={detail.reload} /> : <p className="py-10 text-center text-xs text-[#7185A5]">Loading...</p>}
      </Modal>
    );
  }

  const isArchived = project.status === 'archived';
  const taskList = tasks.data ?? [];

  return (
    <>
      <Modal isOpen onClose={onClose} title={project.name} description={project.clientName ? `Client: ${project.clientName}` : 'Internal project'} size="4xl">
        <div className="space-y-5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <ProjectStatusBadge status={project.status} />
            <span className="text-[#7185A5]">
              {formatDate(project.startDate ?? undefined)} → {formatDate(project.deadline ?? undefined)}
            </span>
            {canManage && (
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" icon={<Edit2 className="w-3.5 h-3.5" />} onClick={() => onEdit(project)}>
                  Edit
                </Button>
                <Button variant="primary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setTaskModalOpen(true)}>
                  Add Task
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={isArchived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                  onClick={() => (isArchived ? toggleArchive() : setConfirmArchive(true))}
                >
                  {isArchived ? 'Unarchive' : 'Archive'}
                </Button>
              </div>
            )}
          </div>

          {project.description && <p className="text-[#475569] whitespace-pre-line">{project.description}</p>}
          <ProgressBar progress={project.progress} label={`${project.completedTaskCount} of ${project.taskCount} tasks done`} />

          <div>
            <span className="font-semibold text-[#111827] block mb-2">Team ({project.members?.length ?? 0})</span>
            {(project.members ?? []).length === 0 ? (
              <p className="text-[#7185A5]">No team members yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {project.members!.map(m => (
                  <span key={m.id} className="px-2.5 py-1 rounded-full bg-[#F1F5F9] text-[#111827]">
                    {m.fullName} <span className="text-[#7185A5]">· {m.designation}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[#DFE6F1] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#DFE6F1] bg-white font-semibold text-[#111827]">Tasks ({taskList.length})</div>
            {tasks.error ? (
              <LoadError message={tasks.error} onRetry={tasks.reload} />
            ) : taskList.length === 0 ? (
              <p className="px-4 py-6 text-center text-[#7185A5]">{tasks.isLoading ? 'Loading…' : 'No tasks yet.'}</p>
            ) : (
              <table className="w-full text-left">
                <tbody className="divide-y divide-[#DFE6F1]">
                  {taskList.map(t => (
                    <tr key={t.id} className="hover:bg-[#F7F9FC] cursor-pointer" onClick={() => navigate(`${canManage ? '/tasks' : '/my/tasks'}/${t.id}`)}>
                      <td className="px-4 py-2.5">
                        <span className="font-semibold text-[#111827]">{t.title}</span> <span className="font-mono text-[10px] text-[#7185A5]">{t.code}</span>
                      </td>
                      <td className="px-4 py-2.5 text-[#475569]">{t.assignee?.fullName ?? 'Unassigned'}</td>
                      <td className="px-4 py-2.5">
                        <PriorityBadge priority={t.priority} />
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <TaskStatusBadge status={t.status} /> {t.overdue && <OverdueBadge />}
                      </td>
                      <td className="px-4 py-2.5 text-[#7185A5]">{t.clientVisible ? 'Client can see' : 'Internal'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Modal>

      {canManage && (
        <TaskModal
          isOpen={taskModalOpen}
          onClose={() => setTaskModalOpen(false)}
          defaultProjectId={project.id}
          onSaved={saved => {
            showToast('success', `${saved.code} created`);
            refresh();
          }}
        />
      )}

      <ConfirmDialog
        isOpen={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={toggleArchive}
        title="Archive project"
        message={`Archive ${project.name}? It will be hidden from project lists and the client portal. Its tasks stay as they are and it can be unarchived later.`}
        confirmLabel="Archive"
      />
    </>
  );
};
