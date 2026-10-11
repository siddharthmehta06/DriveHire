import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/login');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      email: 'admin@example.com',
      password: 'DriveHire2026!',
      role: 'ADMIN',
    });
    expect(fetchMock.mock.calls[1][0]).toContain('/api/vehicles');
    vi.unstubAllGlobals();
  });
});
