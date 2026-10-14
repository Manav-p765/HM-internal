import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { projectsApi, ProjectInput } from '../../api/projects';
import { clientsApi } from '../../api/clients';
import { employeesApi } from '../../api/employees';
import { ApiError, errorMessage } from '../../api/client';
import { EDITABLE_PROJECT_STATUSES, PROJECT_STATUS_LABEL, Project, ProjectStatus } from '../../types/work';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { FormField } from '../common/FormField';
import { fieldClass } from '../work/WorkBits';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectToEdit?: Project | null; // pass the detail (with members) when editing
  onSaved: (project: Project, created: boolean) => void;
}

type Errors = Partial<Record<keyof ProjectInput | 'members', string>>;

// Create / edit a project (admin, manager), including its client and team.
export const ProjectModal: React.FC<ProjectModalProps> = ({ isOpen, onClose, projectToEdit, onSaved }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [status, setStatus] = useState<Exclude<ProjectStatus, 'archived'>>('not_started');
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [teamSearch, setTeamSearch] = useState('');
  const [clients, setClients] = useState<{ id: string; companyName: string }[]>([]);
  const [employees, setEmployees] = useState<{ id: string; fullName: string; designation: string }[]>([]);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const p = projectToEdit;
    setName(p?.name ?? '');
    setDescription(p?.description ?? '');
    setClientId(p?.clientId ?? '');
    setStartDate(p?.startDate ?? '');
    setDeadline(p?.deadline ?? '');
    setStatus(p && p.status !== 'archived' ? p.status : 'not_started');
    setMemberIds(new Set((p?.members ?? []).map(m => m.id)));
    setTeamSearch('');
    setError('');
    setErrors({});
    setIsSaving(false);
    clientsApi.list({ status: 'active', limit: 200 }).then(r => setClients(r.clients)).catch(() => setClients([]));
    employeesApi.list({ status: 'active', limit: 200 }).then(r => setEmployees(r.employees)).catch(() => setEmployees([]));
  }, [isOpen, projectToEdit]);

  const visibleEmployees = useMemo(() => {
    const q = teamSearch.trim().toLowerCase();
    return q ? employees.filter(e => e.fullName.toLowerCase().includes(q) || e.designation.toLowerCase().includes(q)) : employees;
  }, [employees, teamSearch]);

  const toggleMember = (id: string) =>
    setMemberIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const local: Errors = {};
    if (!name.trim()) local.name = 'Project name is required';
    if (startDate && deadline && deadline < startDate) local.deadline = 'Deadline cannot be before the start date';
    setErrors(local);
    if (Object.keys(local).length > 0) return;

    const input: ProjectInput = {
      name: name.trim(),
      description: description.trim() || null,
      clientId: clientId || null,
      startDate: startDate || null,
      deadline: deadline || null,
      ...(projectToEdit?.status === 'archived' ? {} : { status }),
    };
    setIsSaving(true);
    try {
      let saved = projectToEdit ? await projectsApi.update(projectToEdit.id, input) : await projectsApi.create(input);
      const before = new Set((projectToEdit?.members ?? []).map(m => m.id));
      const changed = before.size !== memberIds.size || [...memberIds].some(id => !before.has(id));
      if (changed) saved = await projectsApi.setMembers(saved.id, [...memberIds]);
      onSaved(saved, !projectToEdit);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) {
        const byField: Errors = {};
        for (const d of err.details) byField[(d.path === 'employeeIds' ? 'members' : d.path) as keyof Errors] ??= d.message;
        setErrors(byField);
      }
      setError(errorMessage(err));
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={projectToEdit ? `Edit ${projectToEdit.name}` : 'Add Project'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="p-3 text-xs bg-[#E11D48]/10 border border-[#E11D48]/20 text-[#E11D48] rounded-lg">
            {error}
          </div>
        )}

        <FormField label="Project Name" required error={errors.name}>
          <input aria-label="Project Name" value={name} onChange={e => setName(e.target.value)} className={fieldClass} />
        </FormField>

        <FormField label="Project Description" error={errors.description}>
          <textarea aria-label="Project Description" rows={2} value={description} onChange={e => setDescription(e.target.value)} className={fieldClass} />
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Client Company" error={errors.clientId} hint="Leave as Internal for in-house work.">
            <select aria-label="Client Company" value={clientId} onChange={e => setClientId(e.target.value)} className={fieldClass}>
              <option value="">Internal project (no client)</option>
              {projectToEdit?.clientId && !clients.some(c => c.id === projectToEdit.clientId) && (
                <option value={projectToEdit.clientId}>{projectToEdit.clientName} (inactive)</option>
              )}
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Status" error={errors.status} hint={projectToEdit?.status === 'archived' ? 'Archived: use Unarchive.' : undefined}>
            <select
              aria-label="Status"
              value={projectToEdit?.status === 'archived' ? 'archived' : status}
              disabled={projectToEdit?.status === 'archived'}
              onChange={e => setStatus(e.target.value as Exclude<ProjectStatus, 'archived'>)}
              className={`${fieldClass} disabled:opacity-70`}
            >
              {EDITABLE_PROJECT_STATUSES.map(s => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABEL[s]}
                </option>
              ))}
              {projectToEdit?.status === 'archived' && <option value="archived">Archived</option>}
            </select>
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Start Date" error={errors.startDate}>
            <input aria-label="Start Date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={fieldClass} />
          </FormField>
          <FormField label="Target Deadline" error={errors.deadline}>
            <input aria-label="Target Deadline" type="date" min={startDate || undefined} value={deadline} onChange={e => setDeadline(e.target.value)} className={fieldClass} />
          </FormField>
        </div>

        <FormField label={`Assigned Team (${memberIds.size})`} error={errors.members} hint="Active employees only. People assigned to tasks here are added automatically.">
          <div className="rounded-lg border border-[#DFE6F1]">
            <div className="relative border-b border-[#DFE6F1]">
              <Search className="w-3.5 h-3.5 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                aria-label="Search team members"
                value={teamSearch}
                onChange={e => setTeamSearch(e.target.value)}
                placeholder="Search employees…"
                className="w-full text-xs pl-8 pr-3 py-2 rounded-t-lg focus:outline-none"
              />
            </div>
            <div className="max-h-40 overflow-y-auto divide-y divide-[#DFE6F1]">
              {visibleEmployees.length === 0 ? (
                <p className="px-3 py-3 text-[11px] text-[#7185A5]">No active employees found.</p>
              ) : (
                visibleEmployees.map(emp => (
                  <label key={emp.id} className="flex items-center gap-2.5 px-3 py-2 text-xs cursor-pointer hover:bg-[#F7F9FC]">
                    <input
                      type="checkbox"
                      aria-label={`Team member ${emp.fullName}`}
                      checked={memberIds.has(emp.id)}
                      onChange={() => toggleMember(emp.id)}
                      className="accent-[#5038F5]"
                    />
                    <span className="font-medium text-[#111827]">{emp.fullName}</span>
                    <span className="text-[#7185A5]">{emp.designation}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </FormField>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#DFE6F1]">
          <Button type="button" variant="outline" size="md" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={isSaving}>
            {isSaving ? 'Saving...' : projectToEdit ? 'Save Project' : 'Create Project'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
