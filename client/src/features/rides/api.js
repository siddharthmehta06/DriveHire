import { apiRequest } from '../../api/http';

export async function createRide(token, input) {
  return apiRequest('/rides', { method: 'POST', token, body: input });
}

export async function searchRides(token, filters) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '' && value !== undefined && value !== null) query.set(key, String(value));
  }
  return apiRequest(`/rides?${query.toString()}`, { token });
}

export async function getRide(token, id) {
  return apiRequest(`/rides/${encodeURIComponent(id)}`, { token });
}

export async function listMyRides(token, filters = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '' && value !== undefined && value !== null) query.set(key, String(value));
  }
  return apiRequest(`/rides/mine?${query.toString()}`, { token });
}

export async function cancelRide(token, id) {
  return apiRequest(`/rides/${encodeURIComponent(id)}/cancel`, { method: 'PATCH', token });
}

export async function listRideVehicles(token) {
  return apiRequest('/vehicles?page=1&limit=100&isAvailable=true&verificationStatus=VERIFIED', { token });
}
