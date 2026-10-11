const API_BASE = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest(path, { token, body, headers = {}, ...options } = {}) {
  const requestHeaders = new Headers(headers);
  if (token) requestHeaders.set('Authorization', `Bearer ${token}`);

  let requestBody = body;
  if (body && !(body instanceof FormData)) {
    requestHeaders.set('Content-Type', 'application/json');
    requestBody = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: requestHeaders,
    body: requestBody,
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.success) {
    throw new ApiError(
      payload?.error?.message || `Request failed (${response.status}).`,
      response.status,
      payload?.error?.code,
    );
  }

  return payload;
}
