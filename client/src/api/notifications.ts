import { api } from './client';
import { NotificationFeed } from '../types/work';

// Staff: the bell. Only the caller's own notifications.
export const notificationsApi = {
  feed: () => api<NotificationFeed>('/notifications'),
  markRead: (id: string) => api<{ ok: true }>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => api<{ ok: true }>('/notifications/read-all', { method: 'POST' }),
};
