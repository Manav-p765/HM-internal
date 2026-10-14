import { api } from './client';
import { Client, ClientStatus, MyClientCompany } from '../types';

export interface ClientListParams {
  search?: string;
  status?: ClientStatus;
  limit?: number;
  offset?: number;
}

export interface ClientInput {
  companyName: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  gstin?: string | null;
  notes?: string | null;
}

function toQuery(params: ClientListParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const clientsApi = {
  // admin, manager
  list: (params: ClientListParams = {}) =>
    api<{ clients: Client[]; total: number; limit: number; offset: number }>(`/clients${toQuery(params)}`),

  get: (id: string) => api<{ client: Client }>(`/clients/${id}`).then(r => r.client),

  create: (input: ClientInput) => api<{ client: Client }>('/clients', { method: 'POST', body: input }).then(r => r.client),

  update: (id: string, changes: Partial<ClientInput>) =>
    api<{ client: Client }>(`/clients/${id}`, { method: 'PATCH', body: changes }).then(r => r.client),

  // admin only
  deactivate: (id: string) =>
    api<{ client: Client }>(`/clients/${id}/deactivate`, { method: 'POST', body: {} }).then(r => r.client),

  reactivate: (id: string, restoreLogins: boolean) =>
    api<{ client: Client }>(`/clients/${id}/reactivate`, { method: 'POST', body: { restoreLogins } }).then(r => r.client),

  // client users only: their own company
  me: () => api<{ client: MyClientCompany }>('/clients/me').then(r => r.client),
};
