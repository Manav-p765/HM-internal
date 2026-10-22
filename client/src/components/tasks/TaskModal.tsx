import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { tasksApi, TaskInput } from '../../api/tasks';
import { projectsApi } from '../../api/projects';
import { employeesApi } from '../../api/employees';
import { ApiError, errorMessage } from '../../api/client';
import { Task, TASK_PRIORITIES, TASK_PRIORITY_LABEL, TaskPriority } from '../../types/work';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { FormField } from '../common/FormField';
import { fieldClass } from '../work/WorkBits';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskToEdit?: Task | null;
  defaultProjectId?: string; // "Add task" from a project
  onSaved: (task: Task, created: boolean) => void;
}

type Errors = Partial<Record<keyof TaskInput, string>>;

// Create / edit a task. Admin/manager: any project, and may share it with the client. An employee: a project
// they are on (the server lists only those), for any colleague; edits only their own task while it is to do.
// Status is changed separately (TaskStatusControl). The assignee is notified by the server.
export const TaskModal: React.FC<TaskModalProps> = ({ isOpen, onClose, taskToEdit, defaultProjectId, onSaved }) => {
  const { currentUser } = useApp();
  const isManager = currentUser.role === 'admin' || currentUser.role === 'manager';
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [clientVisible, setClientVisible] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string; clientName: string | null }[]>([]);
  const [employees, setEmployees] = useState<{ id: string; fullName: string; designation: string }[]>([]);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const t = taskToEdit;
    setProjectId(t?.projectId ?? defaultProjectId ?? '');
    setTitle(t?.title ?? '');
    setDescription(t?.description ?? '');
    setAssigneeId(t?.assigneeId ?? '');
    setStartDate(t?.startDate ?? '');
    setDeadline(t?.deadline ?? '');
    setPriority(t?.priority ?? 'medium');
    setClientVisible(t?.clientVisible ?? false);
    setError('');
    setErrors({});
    setIsSaving(false);
    // Pickers: projects (not archived; an employee's own) and ACTIVE employees only. Employees can't read the
    // employee list, so they pick from the staff directory.
    projectsApi.list({ limit: 200 }).then(r => setProjects(r.projects)).catch(() => setProjects([]));
    (isManager ? employeesApi.list({ status: 'active', limit: 200 }).then(r => r.employees) : employeesApi.directory())
      .then(setEmployees)
      .catch(() => setEmployees([]));
  }, [isOpen, taskToEdit, defaultProjectId, isManager]);

  const selectedProject = projects.find(p => p.id === projectId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const local: Errors = {};
    if (!projectId) local.projectId = 'Choose a project';
    if (!title.trim()) local.title = 'Title is required';
    if (startDate && deadline && deadline < startDate) local.deadline = 'Deadline cannot be before the start date';
    setErrors(local);
    if (Object.keys(local).length > 0) return;

    const input: TaskInput = {
      projectId,
      title: title.trim(),
      description: description.trim() || null,
      assigneeId: assigneeId || null,
      startDate: startDate || null,
      deadline: deadline || null,
      priority,
      // Only admin/manager share tasks with the client (the server refuses it from anyone else).
      ...(isManager ? { clientVisible } : {}),
    };
    setIsSaving(true);
    try {
      let saved: Task;
      if (taskToEdit) {
        const { projectId: _ignored, ...changes } = input;
        saved = await tasksApi.update(taskToEdit.id, changes);
      } else {
        saved = await tasksApi.create(input);
      }
      onSaved(saved, !taskToEdit);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) {
        const byField: Errors = {};
        for (const d of err.details) byField[d.path as keyof TaskInput] ??= d.message;
        setErrors(byField);
      }
      setError(errorMessage(err));
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={taskToEdit ? `Edit ${taskToEdit.code}` : isManager ? 'Add Task' : 'Assign a Task'}
      description="Assigning someone adds them to the project team and notifies them"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="p-3 text-xs bg-[#E11D48]/10 border border-[#E11D48]/20 text-[#E11D48] rounded-lg">
            {error}
          </div>
        )}

        <FormField label="Project" required error={errors.projectId}>
          <select
            aria-label="Project"
            value={projectId}
            disabled={Boolean(taskToEdit)}
            onChange={e => setProjectId(e.target.value)}
            className={`${fieldClass} disabled:opacity-70`}
          >
            <option value="">Choose a project…</option>
            {taskToEdit && !projects.some(p => p.id === taskToEdit.projectId) && (
              <option value={taskToEdit.projectId}>{taskToEdit.projectName}</option>
            )}
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.clientName ? ` (${p.clientName})` : ' (internal)'}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Task Title" required error={errors.title}>
          <input aria-label="Task Title" value={title} onChange={e => setTitle(e.target.value)} className={fieldClass} />
        </FormField>

        <FormField label="Description & Acceptance Criteria" error={errors.description}>
          <textarea aria-label="Description" rows={3} value={description} onChange={e => setDescription(e.target.value)} className={fieldClass} />
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Assigned Employee" error={errors.assigneeId} hint="Active employees only.">
            <select aria-label="Assigned Employee" value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className={fieldClass}>
              <option value="">Unassigned</option>
              {taskToEdit?.assignee && !employees.some(e => e.id === taskToEdit.assignee!.id) && (
                <option value={taskToEdit.assignee.id}>{taskToEdit.assignee.fullName} (inactive)</option>
              )}
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName} · {emp.designation}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Priority" error={errors.priority}>
            <select aria-label="Priority" value={priority} onChange={e => setPriority(e.target.value as TaskPriority)} className={fieldClass}>
              {TASK_PRIORITIES.map(p => (
                <option key={p} value={p}>
                  {TASK_PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Start Date" error={errors.startDate}>
            <input aria-label="Start Date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={fieldClass} />
          </FormField>
          <FormField label="Deadline" error={errors.deadline}>
            <input
              aria-label="Deadline"
              type="date"
              value={deadline}
              min={startDate || undefined}
              onChange={e => setDeadline(e.target.value)}
              className={fieldClass}
            />
          </FormField>
        </div>

        {isManager && (
          <label className="flex items-start gap-2.5 p-3 rounded-lg border border-[#DFE6F1] bg-[#F7F9FC] cursor-pointer text-xs">
            <input
              type="checkbox"
              aria-label="Visible to the client"
              checked={clientVisible}
              onChange={e => setClientVisible(e.target.checked)}
              className="mt-0.5 accent-[#5038F5]"
            />
            <span>
              <span className="font-semibold text-[#111827] block">Visible to the client</span>
              <span className="text-[#7185A5]">
                {selectedProject?.clientName
                  ? `${selectedProject.clientName} will see this task's title, description, status, dates and assignee in their portal. Internal notes stay hidden.`
                  : 'The client will see this task in their portal (internal projects have no client, so nobody outside sees it).'}
              </span>
            </span>
          </label>
        )}

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#DFE6F1]">
          <Button type="button" variant="outline" size="md" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={isSaving}>
            {isSaving ? 'Saving...' : taskToEdit ? 'Save Task' : 'Create Task'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
