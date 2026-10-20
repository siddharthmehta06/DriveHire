import { apiRequest, apiRequestBlob } from '../../api/http';

export async function listVerificationQueue(token) {
  return apiRequest('/admin/verifications?page=1&limit=100', { token });
}

export async function getVehicleReview(token, id) {
  return apiRequest(`/admin/verifications/${encodeURIComponent(id)}`, { token });
}

export async function listDriverReviews(token) {
  return apiRequest('/admin/drivers?backgroundCheckStatus=PENDING&page=1&limit=100', { token });
}

export async function approveReviewDocument(token, id) {
  return apiRequest(`/admin/documents/${encodeURIComponent(id)}/approve`, { method: 'POST', token });
}

export async function rejectReviewDocument(token, id, reason) {
  return apiRequest(`/admin/documents/${encodeURIComponent(id)}/reject`, { method: 'POST', token, body: { reason } });
}

export async function approveDriver(token, id) {
  return apiRequest(`/admin/drivers/${encodeURIComponent(id)}/approve`, { method: 'POST', token });
}

export async function rejectDriver(token, id, reason) {
  return apiRequest(`/admin/drivers/${encodeURIComponent(id)}/reject`, { method: 'POST', token, body: { reason } });
}

export async function downloadReviewDocument(token, id) {
  return apiRequestBlob(`/documents/${encodeURIComponent(id)}/file`, { token });
}

export async function getAdminDashboard(token, params = {}) {
  const searchParams = new URLSearchParams();
  if (params.section) searchParams.set('section', params.section);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.q) searchParams.set('q', params.q);
  if (params.status) searchParams.set('status', params.status);
  const query = searchParams.toString();
  return apiRequest(`/admin/dashboard${query ? `?${query}` : ''}`, { token });
}
