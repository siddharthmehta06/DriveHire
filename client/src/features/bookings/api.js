import { apiRequest } from '../../api/http';

export async function requestBooking(token, rideId, { seatsBooked, pickupNote }) {
  return apiRequest(`/rides/${encodeURIComponent(rideId)}/bookings`, {
    method: 'POST',
    token,
    body: { seatsBooked: Number(seatsBooked), pickupNote },
  });
}

export async function acceptBooking(token, bookingId) {
  return apiRequest(`/bookings/${encodeURIComponent(bookingId)}/accept`, {
    method: 'POST',
    token,
  });
}

export async function rejectBooking(token, bookingId, reason) {
  return apiRequest(`/bookings/${encodeURIComponent(bookingId)}/reject`, {
    method: 'POST',
    token,
    body: { reason },
  });
}

export async function cancelBooking(token, bookingId, reason) {
  return apiRequest(`/bookings/${encodeURIComponent(bookingId)}/cancel`, {
    method: 'POST',
    token,
    body: { reason },
  });
}

export async function startRide(token, rideId) {
  return apiRequest(`/rides/${encodeURIComponent(rideId)}/start`, {
    method: 'POST',
    token,
  });
}

export async function completeRide(token, rideId) {
  return apiRequest(`/rides/${encodeURIComponent(rideId)}/complete`, {
    method: 'POST',
    token,
  });
}

export async function fetchMyBookings(token, filters = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '' && value !== undefined && value !== null) {
      query.set(key, String(value));
    }
  }
  return apiRequest(`/bookings/mine?${query.toString()}`, { token });
}

export async function fetchRideBookings(token, rideId) {
  return apiRequest(`/rides/${encodeURIComponent(rideId)}/bookings`, { token });
}

export async function fetchDriverRequests(token, filters = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '' && value !== undefined && value !== null) {
      query.set(key, String(value));
    }
  }
  return apiRequest(`/driver/requests?${query.toString()}`, { token });
}

export async function updateRideLocation(token, rideId, { lat, lng }) {
  return apiRequest(`/rides/${encodeURIComponent(rideId)}/location`, {
    method: 'POST',
    token,
    body: { lat: Number(lat), lng: Number(lng) },
  });
}

export async function fetchRideLocation(token, rideId) {
  return apiRequest(`/rides/${encodeURIComponent(rideId)}/location`, { token });
}
