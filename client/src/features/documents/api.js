import { apiRequest, apiRequestBlob } from '../../api/http';

export async function listDocuments(token, filters = {}) {
  const params = new URLSearchParams({ page: '1', limit: '100' });
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value !== undefined) params.set(key, String(value));
  });
  return apiRequest(`/documents?${params}`, { token });
}

export async function uploadDocument(token, fields, file) {
  const body = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== '' && value !== undefined) body.append(key, String(value));
  });
  body.append('file', file);
  return apiRequest('/documents', { method: 'POST', token, body });
}

export async function downloadDocument(token, id) {
  return apiRequestBlob(`/documents/${encodeURIComponent(id)}/file`, { token });
}

export async function deleteDocument(token, id) {
  return apiRequest(`/documents/${encodeURIComponent(id)}`, { method: 'DELETE', token });
}
