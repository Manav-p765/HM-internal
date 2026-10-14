import { api } from './client';
import { PortalComment, PortalProject, PortalTask } from '../types/work';

// Client portal: only the signed-in client's company, only client-visible tasks, only shared feedback.
export const portalApi = {
  projects: () => api<{ projects: PortalProject[] }>('/portal/projects').then(r => r.projects),
  projectTasks: (projectId: string) =>
    api<{ project: { id: string; name: string }; tasks: PortalTask[] }>(`/portal/projects/${projectId}/tasks`),
  comments: (taskId: string) => api<{ comments: PortalComment[] }>(`/portal/tasks/${taskId}/comments`).then(r => r.comments),
  addComment: (taskId: string, body: string) =>
    api<{ comment: PortalComment }>(`/portal/tasks/${taskId}/comments`, { method: 'POST', body: { body } }).then(r => r.comment),
};
