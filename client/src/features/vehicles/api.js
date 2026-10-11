import { apiRequest } from '../../api/http';

export async function listVehicles(token, filters = {}) {
  const params = new URLSearchParams({ page: '1', limit: '100' });
  if (filters.verificationStatus) params.set('verificationStatus', filters.verificationStatus);
  if (filters.isAvailable !== '') params.set('isAvailable', filters.isAvailable);
  return apiRequest(`/vehicles?${params}`, { token });
}

export async function createVehicle(token, fields, photos) {
  const body = new FormData();
  Object.entries(fields).forEach(([key, value]) => body.append(key, String(value)));
  photos.forEach((photo) => body.append('photos', photo));
  return apiRequest('/vehicles', { method: 'POST', token, body });
}

export async function updateVehicle(token, id, fields) {
  const { photos = [], ...vehicleFields } = fields;
  const body = new FormData();
  Object.entries(vehicleFields).forEach(([key, value]) => {
    body.append(key, Array.isArray(value) ? JSON.stringify(value) : String(value));
  });
  photos.forEach((photo) => body.append('photos', photo));
  return apiRequest(`/vehicles/${id}`, { method: 'PATCH', token, body });
}

export async function setVehicleAvailability(token, id, isAvailable) {
  return apiRequest(`/vehicles/${id}/availability`, {
    method: 'PATCH',
    token,
    body: { isAvailable },
  });
}

export async function deleteVehicle(token, id) {
  return apiRequest(`/vehicles/${id}`, { method: 'DELETE', token });
}
