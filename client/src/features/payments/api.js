import { apiRequest, apiRequestBlob } from '../../api/http';

export async function getPayment(token, id) {
  return apiRequest(`/payments/${id}`, { token });
}

export async function getPaymentByBooking(token, bookingId) {
  return apiRequest(`/payments/booking/${bookingId}`, { token });
}

export async function payOnline(token, id) {
  return apiRequest(`/payments/${id}/pay-online`, {
    token,
    method: 'POST',
  });
}

export async function verifyPayment(token, id, data) {
  return apiRequest(`/payments/${id}/verify`, {
    token,
    method: 'POST',
    body: data,
  });
}

export async function completeMockPayment(token, id, data = {}) {
  return apiRequest(`/payments/${id}/mock/complete`, {
    token,
    method: 'POST',
    body: data,
  });
}

export async function payCash(token, id) {
  return apiRequest(`/payments/${id}/pay-cash`, {
    token,
    method: 'POST',
  });
}

export async function confirmCash(token, id) {
  return apiRequest(`/payments/${id}/confirm-cash`, {
    token,
    method: 'POST',
  });
}

export async function applyPromo(token, id, promoCode) {
  return apiRequest(`/payments/${id}/promo`, {
    token,
    method: 'POST',
    body: { promoCode },
  });
}

export async function removePromo(token, id) {
  return apiRequest(`/payments/${id}/promo`, {
    token,
    method: 'DELETE',
  });
}

export async function getReceipt(token, id) {
  return apiRequest(`/payments/${id}/receipt`, { token });
}

export async function downloadReceiptPdf(token, id) {
  return apiRequestBlob(`/payments/${id}/receipt.pdf`, { token });
}

export async function getCommissionConfig(token) {
  return apiRequest('/admin/pricing/commission', { token });
}

export async function updateCommissionConfig(token, data) {
  return apiRequest('/admin/pricing/commission', {
    token,
    method: 'PUT',
    body: data,
  });
}

export async function listPromoCodes(token, params = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', params.page);
  if (params.limit) query.set('limit', params.limit);
  if (params.active !== undefined) query.set('active', params.active);
  const qStr = query.toString() ? `?${query.toString()}` : '';
  return apiRequest(`/admin/promo-codes${qStr}`, { token });
}

export async function createPromoCode(token, data) {
  return apiRequest('/admin/promo-codes', {
    token,
    method: 'POST',
    body: data,
  });
}

export async function updatePromoCode(token, id, data) {
  return apiRequest(`/admin/promo-codes/${id}`, {
    token,
    method: 'PATCH',
    body: data,
  });
}
