import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { AuthProvider } from '../../context/AuthContext';

vi.mock('./components/RouteMap', () => ({
  RouteMap: () => <div aria-label="Route map preview">Route map</div>,
}));

vi.mock('./useRideSocket', () => ({
  useRideSocket: () => ({ connected: true, connectionError: '' }),
}));

function session(role = 'USER') {
  window.localStorage.setItem('drivehire-session', JSON.stringify({
    token: 'ride-session',
    user: { id: role === 'DRIVER' ? 'driver-1' : 'passenger-1', name: role === 'DRIVER' ? 'Sample Driver' : 'Sample Passenger', email: 'user@example.com', role },
  }));
}

function jsonResponse(data, meta) {
  return { ok: true, status: 200, json: async () => ({ success: true, data, ...(meta ? { meta } : {}) }) };
}

const ride = {
  id: 'ride-1',
  driverId: 'driver-1',
  vehicleId: 'vehicle-1',
  originText: 'Pune',
  originLat: 18.5204,
  originLng: 73.8567,
  destText: 'Mumbai',
  destLat: 19.076,
  destLng: 72.8777,
  departureTime: '2026-10-13T09:00:00.000Z',
  totalSeats: 3,
  availableSeats: 3,
  costPerSeat: '650.00',
  status: 'OPEN',
  driver: { firstName: 'Sample' },
  vehicle: { make: 'Honda', model: 'City', vehicleType: 'SEDAN' },
};

afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('carpool ride pages', () => {
  it('searches rides and renders the route, seat count, cost, and map', async () => {
    const fetchMock = vi.fn((url) => {
      if (url === '/api/rides' || url.startsWith('/api/rides?')) return jsonResponse([ride], { page: 1, limit: 20, total: 1 });
      return jsonResponse([], { unreadCount: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);
    session();
    window.history.pushState({}, '', '/rides/search');
    render(<AuthProvider><App /></AuthProvider>);

    expect(await screen.findByRole('heading', { name: 'Pune' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mumbai' })).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.classList.contains('ride-card__price'))).toBeInTheDocument();
    expect(screen.getByLabelText('Route map preview')).toBeInTheDocument();
    expect(screen.getByText('Live seat updates connected')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('To'), { target: { value: 'Mumbai' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search rides' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('destination=Mumbai'))).toBe(true));
  });

  it('posts a ride using a verified vehicle and server-controlled seat count', async () => {
    const vehicle = {
      id: 'vehicle-1',
      make: 'Honda',
      model: 'City',
      registrationNumber: 'MH14EF9012',
      seatCapacity: 4,
    };
    const fetchMock = vi.fn((url, options = {}) => {
      if (url.includes('/api/vehicles')) return jsonResponse([vehicle], { page: 1, limit: 100, total: 1 });
      if (url === '/api/rides' && options.method === 'POST') return jsonResponse({ ...ride, ...JSON.parse(options.body) });
      return jsonResponse([], { unreadCount: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);
    session('DRIVER');
    window.history.pushState({}, '', '/rides/post');
    render(<AuthProvider><App /></AuthProvider>);

    expect(await screen.findByRole('heading', { name: 'Post a ride' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Origin name'), { target: { value: 'Pune' } });
    fireEvent.change(screen.getByLabelText('Destination name'), { target: { value: 'Mumbai' } });
    fireEvent.change(screen.getByLabelText('Cost per seat (INR)'), { target: { value: '650' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post ride' }));

    expect(await screen.findByRole('heading', { name: 'Pune to Mumbai' })).toBeInTheDocument();
    const request = fetchMock.mock.calls.find(([url, options]) => url === '/api/rides' && options.method === 'POST');
    expect(JSON.parse(request[1].body)).toMatchObject({ vehicleId: 'vehicle-1', totalSeats: 3, costPerSeat: 650 });
  });

  it('shows the driver schedule and cancels an open ride', async () => {
    const fetchMock = vi.fn((url, options = {}) => {
      if (url.includes('/api/rides/mine')) return jsonResponse([ride], { page: 1, limit: 100, total: 1 });
      if (url.includes('/cancel') && options.method === 'PATCH') return jsonResponse({ ...ride, status: 'CANCELLED' });
      return jsonResponse([], { unreadCount: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);
    session('DRIVER');
    window.history.pushState({}, '', '/rides/mine');
    render(<AuthProvider><App /></AuthProvider>);

    expect(await screen.findByRole('heading', { name: 'My rides' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel ride' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('/cancel'))).toBe(true));
    expect((await screen.findAllByText('CANCELLED')).some((element) => element.classList.contains('ride-status-tag'))).toBe(true);
  });

  it('shows a privacy-safe ride detail page', async () => {
    const fetchMock = vi.fn((url) => url === '/api/rides/ride-1'
      ? jsonResponse(ride)
      : jsonResponse([], { unreadCount: 0 }));
    vi.stubGlobal('fetch', fetchMock);
    session();
    window.history.pushState({}, '', '/rides/ride-1');
    render(<AuthProvider><App /></AuthProvider>);

    expect(await screen.findByRole('heading', { name: 'Pune to Mumbai' })).toBeInTheDocument();
    expect(screen.getAllByText('Sample').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₹650').length).toBeGreaterThan(0);
    expect(screen.queryByText('user@example.com')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Route map preview')).toBeInTheDocument();
  });

  it('keeps driver-only ride pages behind role-based access', () => {
    vi.stubGlobal('fetch', vi.fn());
    session('USER');
    window.history.pushState({}, '', '/rides/post');
    render(<AuthProvider><App /></AuthProvider>);

    expect(screen.getByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
