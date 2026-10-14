import { api } from './client';
import { toQuery } from './query';
import { Project, ProjectStatus } from '../types/work';

export interface ProjectListParams {
  status?: ProjectStatus;
  clientId?: string; // a client uuid, or 'internal'
  search?: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

export interface ProjectInput {
  name: string;
  description?: string | null;
  clientId?: string | null;
  startDate?: string | null;
  deadline?: string | null;
  status?: Exclude<ProjectStatus, 'archived'>;
}

// Staff. Admin/manager see all projects; employees only projects they are a member of.
export const projectsApi = {
  list: (params: ProjectListParams = {}) =>
    api<{ projects: Project[]; total: number; limit: number; offset: number }>(`/projects${toQuery(params)}`),
  get: (id: string) => api<{ project: Project }>(`/projects/${id}`).then(r => r.project),
  create: (input: ProjectInput) => api<{ project: Project }>('/projects', { method: 'POST', body: input }).then(r => r.project),
  update: (id: string, changes: Partial<ProjectInput>) =>
    api<{ project: Project }>(`/projects/${id}`, { method: 'PATCH', body: changes }).then(r => r.project),
  setMembers: (id: string, employeeIds: string[]) =>
    api<{ project: Project }>(`/projects/${id}/members`, { method: 'PUT', body: { employeeIds } }).then(r => r.project),
  archive: (id: string) => api<{ project: Project }>(`/projects/${id}/archive`, { method: 'POST', body: {} }).then(r => r.project),
  unarchive: (id: string) => api<{ project: Project }>(`/projects/${id}/unarchive`, { method: 'POST', body: {} }).then(r => r.project),
};
