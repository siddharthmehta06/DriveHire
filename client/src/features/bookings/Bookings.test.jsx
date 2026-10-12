import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { AuthProvider } from '../../context/AuthContext';

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  CircleMarker: ({ children }) => <div data-testid="circle-marker">{children}</div>,
  Polyline: () => <div data-testid="polyline" />,
  Popup: ({ children }) => <div data-testid="popup">{children}</div>,
  useMap: () => ({ fitBounds: vi.fn(), setView: vi.fn(), getZoom: vi.fn(() => 10) }),
  useMapEvents: () => null,
}));

vi.mock('../rides/components/RouteMap', () => ({
  RouteMap: () => <div aria-label="Route map preview">Route map</div>,
}));

vi.mock('../rides/useRideSocket', () => ({
  useRideSocket: () => ({ connected: true, connectionError: '' }),
}));

vi.mock('socket.io-client', () => ({
  io: () => ({
    on: vi.fn((event, cb) => {
      if (event === 'connect') cb();
    }),
    emit: vi.fn((event, data, cb) => {
      if (typeof cb === 'function') cb({ success: true, data: { rideId: data } });
    }),
    disconnect: vi.fn(),
  }),
}));

function session(role = 'USER') {
  window.localStorage.setItem('drivehire-session', JSON.stringify({
    token: 'test-booking-token',
    user: {
      id: role === 'DRIVER' ? 'driver-1' : 'passenger-1',
      name: role === 'DRIVER' ? 'Test Driver' : 'Test Passenger',
      email: 'user@example.com',
      role,
    },
  }));
}

function jsonResponse(data, meta) {
  return { ok: true, status: 200, json: async () => ({ success: true, data, ...(meta ? { meta } : {}) }) };
}

const mockRide = {
  id: 'ride-1',
  driverId: 'driver-1',
  vehicleId: 'vehicle-1',
  originText: 'Pune Station',
  originLat: 18.5284,
  originLng: 73.8743,
  destText: 'Mumbai Airport',
  destLat: 19.0902,
  destLng: 72.8628,
  departureTime: new Date(Date.now() + 5 * 3600 * 1000).toISOString(),
  totalSeats: 3,
  availableSeats: 2,
  costPerSeat: '600.00',
  status: 'OPEN',
  driver: { firstName: 'Driver', name: 'Driver One' },
  vehicle: { make: 'Tata', model: 'Nexon', vehicleType: 'SUV' },
};

const mockBooking = {
  id: 'booking-1',
  userId: 'passenger-1',
  type: 'RIDE',
  status: 'PENDING',
  bookingDate: new Date().toISOString(),
  rideBooking: {
    bookingId: 'booking-1',
    rideId: 'ride-1',
    passengerId: 'passenger-1',
    seatsBooked: 1,
    pickupNote: 'Waiting near gate 2',
    active: true,
    ride: mockRide,
  },
  user: {
    id: 'passenger-1',
    name: 'Test Passenger',
    email: 'passenger@example.com',
    phone: '9876543210',
  },
};

afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('F05 Ride Booking Client Flows', () => {
  it('opens seat request modal on RideDetailPage and submits request', async () => {
    let requestedSeats = 0;
    const fetchMock = vi.fn((url, options) => {
      if (url === '/api/rides/ride-1') return jsonResponse(mockRide);
      if (url === '/api/rides/ride-1/bookings' && options?.method === 'POST') {
        const body = JSON.parse(options.body);
        requestedSeats = body.seatsBooked;
        return jsonResponse({ ...mockBooking, rideBooking: { ...mockBooking.rideBooking, seatsBooked: requestedSeats } });
      }
      return jsonResponse([], { unreadCount: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);

    session('USER');
    window.history.pushState({}, '', '/rides/ride-1');

    render(
      <AuthProvider>
        <App />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Request seats')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Request seats'));

    expect(screen.getByText('Request seats on this ride')).toBeInTheDocument();
    expect(screen.getByText('Send seat request')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Send seat request'));

    await waitFor(() => {
      expect(screen.getByText(/Seat request submitted to driver!/i)).toBeInTheDocument();
    });
    expect(requestedSeats).toBe(1);
  });

  it('renders MyBookingsPage with upcoming reservations and receipt button disabled', async () => {
    const fetchMock = vi.fn((url) => {
      if (url.includes('/api/bookings/mine')) return jsonResponse([mockBooking]);
      return jsonResponse([], { unreadCount: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);

    session('USER');
    window.history.pushState({}, '', '/bookings');

    render(
      <AuthProvider>
        <App />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('My Bookings')).toBeInTheDocument();
      expect(screen.getByText(/Pune Station/i)).toBeInTheDocument();
      expect(screen.getByText(/Mumbai Airport/i)).toBeInTheDocument();
    });

    // Check receipt button is present and disabled
    const receiptBtn = screen.getByText('Receipt (F06)');
    expect(receiptBtn).toBeDisabled();
  });

  it('renders TrackRidePage and displays route telemetry', async () => {
    const mockLocation = {
      rideId: 'ride-1',
      lat: 18.53,
      lng: 73.86,
      updatedAt: new Date().toISOString(),
    };

    const fetchMock = vi.fn((url) => {
      if (url === '/api/rides/ride-1') return jsonResponse(mockRide);
      if (url === '/api/rides/ride-1/location') return jsonResponse(mockLocation);
      return jsonResponse([], { unreadCount: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);

    session('USER');
    window.history.pushState({}, '', '/rides/ride-1/track');

    render(
      <AuthProvider>
        <App />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Live Ride Tracking')).toBeInTheDocument();
      expect(screen.getByTestId('map-container')).toBeInTheDocument();
      expect(screen.getByText(/18.5300° N/i)).toBeInTheDocument();
    });
  });

  it('renders RideRequestsPage for driver and allows accepting pending request', async () => {
    let accepted = false;
    const fetchMock = vi.fn((url, options) => {
      if (url.includes('/api/driver/requests')) return jsonResponse([mockBooking]);
      if (url === '/api/bookings/booking-1/accept' && options?.method === 'POST') {
        accepted = true;
        return jsonResponse({ ...mockBooking, status: 'ACCEPTED' });
      }
      return jsonResponse([], { unreadCount: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);

    session('DRIVER');
    window.history.pushState({}, '', '/driver/requests');

    render(
      <AuthProvider>
        <App />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Ride Booking Requests')).toBeInTheDocument();
      expect(screen.getByText('Accept request')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Accept request'));

    await waitFor(() => {
      expect(accepted).toBe(true);
    });
  });

  it('renders DriverRideManagePage and displays Start Ride and GPS toggle', async () => {
    let started = false;
    const fetchMock = vi.fn((url, options) => {
      if (url === '/api/rides/ride-1') return jsonResponse(mockRide);
      if (url === '/api/rides/ride-1/bookings') return jsonResponse([mockBooking]);
      if (url === '/api/rides/ride-1/start' && options?.method === 'POST') {
        started = true;
        return jsonResponse({ ...mockRide, status: 'IN_PROGRESS' });
      }
      return jsonResponse([], { unreadCount: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);

    session('DRIVER');
    window.history.pushState({}, '', '/driver/rides/ride-1');

    render(
      <AuthProvider>
        <App />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Manage Scheduled Ride')).toBeInTheDocument();
      expect(screen.getByText('▶ Start Ride (Depart)')).toBeInTheDocument();
      expect(screen.getByText('Transmit Location')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('▶ Start Ride (Depart)'));

    await waitFor(() => {
      expect(started).toBe(true);
    });
  });
});
