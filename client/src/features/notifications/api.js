import { apiRequest } from '../../api/http';

export function listNotifications(token) {
  return apiRequest('/notifications?page=1&limit=10', { token });
}

export function markNotificationRead(token, id) {
  return apiRequest(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH', token });
}

export function markAllNotificationsRead(token) {
  return apiRequest('/notifications/read-all', { method: 'POST', token });
}
