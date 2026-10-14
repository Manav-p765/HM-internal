import { api } from './client';
import { toQuery } from './query';
import { CommentType, Task, TaskComment, TaskPriority, TaskStatus, TaskSummary } from '../types/work';

export interface TaskListParams {
  projectId?: string;
  assigneeId?: string; // uuid or 'unassigned' (ignored by the server for employees)
  priority?: TaskPriority;
  status?: TaskStatus;
  overdue?: boolean;
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

// Staff. Employees only ever get their own tasks (the server enforces it).
export const tasksApi = {
  list: (params: TaskListParams = {}) =>
    api<{ tasks: Task[]; total: number; limit: number; offset: number }>(`/tasks${toQuery(params)}`),
  summary: () => api<{ summary: TaskSummary }>('/tasks/summary').then(r => r.summary),
  get: (id: string) => api<{ task: Task }>(`/tasks/${id}`).then(r => r.task),
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
};
