import { api } from './client';
import { PortalAssignee, PortalComment, PortalProject, PortalTask, PortalTaskInput } from '../types/work';
import { PortalInvoiceResponse, PortalInvoicesResponse } from '../types/invoices';

// Client portal: only the signed-in client's company, only client-visible tasks, only shared feedback, and
// the company's own issued invoices (read-only).
export const portalApi = {
  // Where a shared task link (/task/TSK-042) opens: the company's own shared task, else 404.
  taskByCode: (code: string) => api<{ taskId: string; projectId: string }>(`/portal/tasks/by-code/${encodeURIComponent(code)}`),
  projects: () => api<{ projects: PortalProject[] }>('/portal/projects').then(r => r.projects),
  projectTasks: (projectId: string) =>
    api<{ project: { id: string; name: string }; tasks: PortalTask[] }>(`/portal/projects/${projectId}/tasks`),
  comments: (taskId: string) => api<{ comments: PortalComment[] }>(`/portal/tasks/${taskId}/comments`).then(r => r.comments),
  addComment: (taskId: string, body: string) =>
    api<{ comment: PortalComment }>(`/portal/tasks/${taskId}/comments`, { method: 'POST', body: { body } }).then(r => r.comment),
  // Task requests: on the company's own projects, assigned to that project's team.
  assignees: (projectId: string) => api<{ assignees: PortalAssignee[] }>(`/portal/projects/${projectId}/assignees`).then(r => r.assignees),
  requestTask: (projectId: string, input: PortalTaskInput) =>
    api<{ task: PortalTask }>(`/portal/projects/${projectId}/tasks`, { method: 'POST', body: input }).then(r => r.task),
  updateRequest: (taskId: string, changes: Partial<PortalTaskInput>) =>
    api<{ task: PortalTask }>(`/portal/tasks/${taskId}`, { method: 'PATCH', body: changes }).then(r => r.task),
  invoices: () => api<PortalInvoicesResponse>('/portal/invoices'),
  invoice: (id: string) => api<PortalInvoiceResponse>(`/portal/invoices/${id}`),
};
