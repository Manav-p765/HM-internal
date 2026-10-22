import React, { useEffect, useState } from 'react';
import { portalApi } from '../../api/portal';
import { ApiError, errorMessage } from '../../api/client';
import { PortalAssignee, PortalTask, PortalTaskInput, TASK_PRIORITIES, TASK_PRIORITY_LABEL, TaskPriority } from '../../types/work';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { FormField } from '../common/FormField';
import { fieldClass } from '../work/WorkBits';

// "Request a task" on one of the client's projects, or change one of their own requests before work starts.
// Assignees are that project's team as the server lists them; the server checks every field again (and
// refuses an assignee outside the team, a past deadline, or a request that has started).
const KEEP = '__keep__';

export const PortalTaskRequestModal: React.FC<{
  projectId: string;
  task: PortalTask | null; // null = new request
  onClose: () => void;
  onSaved: (task: PortalTask) => void;
}> = ({ projectId, task, onClose, onSaved }) => {
  const [assignees, setAssignees] = useState<PortalAssignee[] | null>(null);
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium');
  const [deadline, setDeadline] = useState(task?.deadline ?? '');
  // Editing: the current assignee is kept unless another one is picked (the portal never sees their id).
  const [assigneeId, setAssigneeId] = useState(task ? KEEP : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    portalApi.assignees(projectId).then(setAssignees, err => setFormError(errorMessage(err)));
  }, [projectId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError('');
    setSaving(true);
    const input: PortalTaskInput = {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      deadline: deadline || null,
      ...(assigneeId === KEEP ? {} : { assigneeId: assigneeId || null }),
    };
    try {
      onSaved(task ? await portalApi.updateRequest(task.id, input) : await portalApi.requestTask(projectId, input));
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) setErrors(Object.fromEntries(err.details.map(d => [d.path, d.message])));
      setFormError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={task ? `Edit request ${task.code}` : 'Request a task'}
      description={task ? 'You can change your request until the team starts on it.' : 'It goes straight to the person you choose; the project team is notified.'}
      maxWidth="lg"
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && (
          <div role="alert" className="p-3 text-xs bg-[#E11D48]/10 border border-[#E11D48]/20 text-[#E11D48] rounded-lg">
            {formError}
          </div>
        )}
        <FormField label="What needs doing" required error={errors.title}>
          <input aria-label="Task title" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} className={fieldClass} placeholder="e.g. Add a FAQ section to the pricing page" />
        </FormField>
        <FormField label="Details" error={errors.description}>
          <textarea aria-label="Task details" rows={4} value={description} onChange={e => setDescription(e.target.value)} maxLength={5000} className={fieldClass} />
        </FormField>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormField label="Assign to" error={errors.assigneeId}>
            <select aria-label="Assign to" value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className={fieldClass} disabled={!assignees}>
              {task && <option value={KEEP}>{task.assignee ? `Keep ${task.assignee.fullName}` : 'Keep unassigned'}</option>}
              <option value="">Let the team decide</option>
              {(assignees ?? []).map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.designation}
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
          <FormField label="Needed by" error={errors.deadline}>
            <input aria-label="Needed by" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className={fieldClass} />
          </FormField>
        </div>
        <div className="flex justify-end gap-3 pt-3 border-t border-[#DFE6F1]">
          <Button type="button" variant="outline" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={saving || !title.trim()}>
            {saving ? 'Saving…' : task ? 'Save changes' : 'Send request'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
