import { api } from './client';

// Employee role only: "still here" while the tab is visible (see usePresence).
export const presenceApi = {
  heartbeat: () => api<{ ok: true }>('/presence/heartbeat', { method: 'POST', body: {} }),
};
