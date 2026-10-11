import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AuthProvider } from './context/AuthContext';

describe('DriveHire access screen', () => {
  it('offers owner, driver, and administrator sign-in and submits the selected role', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => ({
      ok: true,
      status: 200,
      json: async () => url === '/api/auth/login'
        ? {
          success: true,
          data: {
            token: 'session-token',
            user: { id: 'admin-id', name: 'DriveHire Admin', email: 'admin@example.com', role: 'ADMIN' },
          },
        }
        : { success: true, data: [], meta: { total: 0, page: 1, limit: 100 } },
    }));
    vi.stubGlobal('fetch', fetchMock);
    window.localStorage.clear();

    render(<AuthProvider><App /></AuthProvider>);

    expect(screen.getByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Owner' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Driver' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Admin' }));
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'DriveHire2026!' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Vehicle overview' })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/login');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      email: 'admin@example.com',
      password: 'DriveHire2026!',
      role: 'ADMIN',
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([
      expect.stringContaining('/api/vehicles'),
      expect.stringContaining('/api/notifications'),
    ]));
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(await screen.findByText('Your account has no notifications yet.')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('renders the protected document register and its role-specific upload fields', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => ({
      ok: true,
      status: 200,
      json: async () => url.includes('/api/vehicles')
        ? { success: true, data: [{ id: 'vehicle-1', make: 'Toyota', model: 'Innova', registrationNumber: 'MH12AB1234' }] }
        : { success: true, data: [], meta: { total: 0, page: 1, limit: 100, unreadCount: 0 } },
    }));
    vi.stubGlobal('fetch', fetchMock);
    window.localStorage.setItem('drivehire-session', JSON.stringify({
      token: 'document-session',
      user: { id: 'owner-id', name: 'Vehicle Owner', email: 'owner@example.com', role: 'USER' },
    }));
    window.history.pushState({}, '', '/documents');

    render(<AuthProvider><App /></AuthProvider>);

    expect(await screen.findByRole('heading', { name: 'Documents' })).toBeInTheDocument();
    expect(screen.getByLabelText('Document type')).toBeInTheDocument();
    expect(screen.getByLabelText('Vehicle')).toBeInTheDocument();
    expect(within(screen.getByLabelText('Document type')).queryByRole('option', { name: 'Driving licence' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([
      expect.stringContaining('/api/documents'),
      '/api/vehicles?page=1&limit=100',
      expect.stringContaining('/api/notifications'),
    ]));

    window.history.pushState({}, '', '/');
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('shows the administrator verification queue and requires a rejection reason', async () => {
    const vehicle = {
      id: 'vehicle-review-1',
      make: 'Toyota',
      model: 'Innova',
      year: 2024,
      registrationNumber: 'MH12AB1234',
      owner: { id: 'owner-1', name: 'Vehicle Owner', email: 'owner@example.com', phone: '9999999999' },
      documents: [{
        id: 'document-review-1',
        type: 'RC',
        documentNumber: 'RC-100',
        expiryDate: '2027-12-31T00:00:00.000Z',
        status: 'PENDING',
        originalName: 'rc.pdf',
      }],
      audit: [{ id: 'audit-1', action: 'SUBMITTED', createdAt: '2026-10-11T00:00:00.000Z' }],
    };
    const fetchMock = vi.fn().mockImplementation((url, options = {}) => {
      const rejected = url.includes('/reject');
      return {
        ok: true,
        status: 200,
        json: async () => {
          if (url.includes('/api/admin/verifications?')) return { success: true, data: rejected ? [] : [vehicle] };
          if (url.includes('/api/admin/verifications/')) return { success: true, data: vehicle };
          if (url.includes('/api/notifications')) return { success: true, data: [], meta: { unreadCount: 0 } };
          return { success: true, data: { id: 'document-review-1' } };
        },
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    window.localStorage.setItem('drivehire-session', JSON.stringify({
      token: 'admin-session',
      user: { id: 'admin-id', name: 'DriveHire Admin', email: 'admin@example.com', role: 'ADMIN' },
    }));
    window.history.pushState({}, '', '/admin/verifications');

    render(<AuthProvider><App /></AuthProvider>);

    expect(await screen.findByRole('heading', { name: 'Verification queue' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Toyota Innova' })).toBeInTheDocument();
    expect(screen.queryByText('/private/uploads/rc.pdf')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Registration details are unreadable.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rejection' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('/admin/documents/document-review-1/reject'))).toBe(true));
    expect(fetchMock.mock.calls.some(([, options]) => options?.body === JSON.stringify({ reason: 'Registration details are unreadable.' }))).toBe(true);

    window.history.pushState({}, '', '/');
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('lets a vehicle owner submit an unverified vehicle for administrator review', async () => {
    const vehicle = {
      id: 'vehicle-submit-1',
      make: 'Toyota',
      model: 'Corolla',
      year: 2024,
      registrationNumber: 'MH12AB1234',
      vehicleType: 'SEDAN',
      seatCapacity: 4,
      photoUrls: [],
      verificationStatus: 'UNVERIFIED',
      isAvailable: true,
      createdAt: '2026-10-11T00:00:00.000Z',
    };
    const fetchMock = vi.fn().mockImplementation((url) => ({
      ok: true,
      status: 200,
      json: async () => {
        if (url.includes('/api/notifications')) return { success: true, data: [], meta: { unreadCount: 0 } };
        if (url.includes('/submit-verification')) return { success: true, data: { ...vehicle, verificationStatus: 'UNDER_REVIEW' } };
        return { success: true, data: [vehicle], meta: { total: 1, page: 1, limit: 100 } };
      },
    }));
    vi.stubGlobal('fetch', fetchMock);
    window.localStorage.setItem('drivehire-session', JSON.stringify({
      token: 'owner-session',
      user: { id: 'owner-id', name: 'Vehicle Owner', email: 'owner@example.com', role: 'USER' },
    }));
    window.history.pushState({}, '', '/');

    render(<AuthProvider><App /></AuthProvider>);

    expect(await screen.findByText('Toyota Corolla')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View Toyota Corolla' }));
    expect(await screen.findByRole('region', { name: 'Vehicle verification timeline' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Submit for verification' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('/submit-verification'))).toBe(true));
    expect(await screen.findByText('Administrator review')).toBeInTheDocument();

    window.localStorage.clear();
    vi.unstubAllGlobals();
  });
});
