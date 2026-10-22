import { api } from './client';
import { toQuery } from './query';
import { CommentType, Task, TaskAttachment, TaskComment, TaskPriority, TaskStatus, TaskSummary } from '../types/work';

export interface TaskListParams {
  projectId?: string;
  assigneeId?: string; // uuid or 'unassigned' (ignored by the server for employees)
  priority?: TaskPriority;
  status?: TaskStatus;
  overdue?: boolean;
  requestedByClient?: boolean; // admin/manager: tasks clients asked for in the portal
  view?: 'assigned_by_me'; // tasks the caller assigned to someone else
  search?: string;
  limit?: number;
  offset?: number;
}

export interface TaskInput {
  projectId: string;
  title: string;
  description?: string | null;
  assigneeId?: string | null;
  startDate?: string | null;
  deadline?: string | null;
  priority?: TaskPriority;
  clientVisible?: boolean;
}

// Staff. Employees only ever get tasks assigned to them or by them (the server enforces it).
export const tasksApi = {
  list: (params: TaskListParams = {}) =>
    api<{ tasks: Task[]; total: number; limit: number; offset: number }>(`/tasks${toQuery(params)}`),
  summary: () => api<{ summary: TaskSummary }>('/tasks/summary').then(r => r.summary),
  get: (id: string) => api<{ task: Task }>(`/tasks/${id}`).then(r => r.task),
  // A shared link (/task/TSK-042): any staff member may open any task.
  byCode: (code: string) => api<{ task: Task }>(`/tasks/by-code/${encodeURIComponent(code)}`).then(r => r.task),
  create: (input: TaskInput) => api<{ task: Task }>('/tasks', { method: 'POST', body: input }).then(r => r.task),
  update: (id: string, changes: Partial<Omit<TaskInput, 'projectId'>>) =>
    api<{ task: Task }>(`/tasks/${id}`, { method: 'PATCH', body: changes }).then(r => r.task),
  remove: (id: string) => api<{ ok: true }>(`/tasks/${id}`, { method: 'DELETE' }),
  setStatus: (id: string, status: TaskStatus, comment?: string) =>
    api<{ task: Task }>(`/tasks/${id}/status`, { method: 'PATCH', body: { status, comment: comment || null } }).then(r => r.task),
  comments: (id: string) => api<{ comments: TaskComment[] }>(`/tasks/${id}/comments`).then(r => r.comments),
  addComment: (id: string, body: string, type: CommentType) =>
    api<{ comment: TaskComment }>(`/tasks/${id}/comments`, { method: 'POST', body: { body, type } }).then(r => r.comment),
  deleteComment: (commentId: string) => api<{ ok: true }>(`/comments/${commentId}`, { method: 'DELETE' }),

  // Attachments: anyone who opens the task views and downloads; the assignee, the assigner and managers add/remove.
  attachments: (id: string) => api<{ attachments: TaskAttachment[] }>(`/tasks/${id}/attachments`).then(r => r.attachments),
  addLink: (id: string, url: string, name?: string) =>
    api<{ attachment: TaskAttachment }>(`/tasks/${id}/attachments/link`, { method: 'POST', body: { url, name: name || undefined } }).then(r => r.attachment),
  uploadFile: (id: string, file: File) =>
    api<{ attachment: TaskAttachment }>(`/tasks/${id}/attachments/file`, {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
    }).then(r => r.attachment),
  removeAttachment: (id: string, attachmentId: string) => api<{ ok: true }>(`/tasks/${id}/attachments/${attachmentId}`, { method: 'DELETE' }),
  // A plain link: the browser downloads it with the session cookie.
  downloadUrl: (id: string, attachmentId: string) => `/api/tasks/${id}/attachments/${attachmentId}/download`,
};
