import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { AuthProvider } from "../context/AuthContext";

vi.mock("../rides/components/RouteMap", () => ({
  RouteMap: () => <div aria-label="Route map preview">Route map</div>,
}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ children }) => <div data-testid="marker">{children}</div>,
  CircleMarker: ({ children }) => <div data-testid="circle-marker">{children}</div>,
  Popup: ({ children }) => <div data-testid="popup">{children}</div>,
  Polyline: () => <div data-testid="polyline" />,
  useMap: () => ({ fitBounds: vi.fn(), setView: vi.fn() }),
  useMapEvents: () => ({}),
}));


afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.pushState({}, "", "/");
  vi.unstubAllGlobals();
});

const mockAdminUser = { id: "admin-1", name: "Admin User", role: "ADMIN" };
const mockDriverUser = { id: "driver-1", name: "Driver User", role: "DRIVER" };
const mockRegularUser = { id: "user-1", name: "Regular User", role: "USER" };

function setSession(user) {
  window.localStorage.setItem(
    "drivehire-session",
    JSON.stringify({
      token: "test-token",
      user,
    }),
  );
}

const mockStats = {
  users: 10,
  drivers: { APPROVED: 5, PENDING: 2 },
  vehicles: { VERIFIED: 8, UNDER_REVIEW: 1 },
  documents: { PENDING: 3, APPROVED: 10 },
  activeRides: 2,
  upcomingRides: 4,
  reviews: 5,
  averageRating: 4.8,
};

function setupFetchMock() {
  const fetchMock = vi.fn().mockImplementation((url) => {
    const parsed = new URL(url, "http://localhost");
    const path = parsed.pathname;

    if (path.includes("/api/admin/dashboard")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            section: "USERS",
            stats: mockStats,
            items: [],
            total: 0,
            page: 1,
            limit: 15,
          },
          meta: { total: 0, page: 1, limit: 15 },
        }),
      });
    }

    if (path.includes("/api/admin/verifications")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [],
          meta: { total: 0, page: 1, limit: 100 },
        }),
      });
    }

    if (path.includes("/api/admin/drivers")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [],
          meta: { total: 0, page: 1, limit: 100 },
        }),
      });
    }

    if (path.includes("/api/admin/pricing")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { commissionRatePct: 10 },
        }),
      });
    }

    if (path.includes("/api/admin/promo-codes")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [],
        }),
      });
    }

    if (path.includes("/api/vehicles")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [],
          meta: { total: 0, page: 1, limit: 100 },
        }),
      });
    }

    if (path.includes("/api/documents")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [],
          meta: { total: 0, page: 1, limit: 100 },
        }),
      });
    }

    if (path.includes("/api/driver/rides/")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            id: "ride-123",
            originText: "Mumbai",
            destText: "Pune",
            departureTime: new Date(Date.now() + 86400000).toISOString(),
            availableSeats: 3,
            totalSeats: 4,
            status: "OPEN",
            bookings: [],
          },
        }),
      });
    }

    if (path.match(/\/api\/rides\/[^/]+$/) && !path.includes("search") && !path.includes("mine")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            id: "ride-123",
            originText: "Mumbai",
            originLat: 19.076,
            originLng: 72.8777,
            destText: "Pune",
            destLat: 18.5204,
            destLng: 73.8567,
            departureTime: new Date(Date.now() + 86400000).toISOString(),
            availableSeats: 3,
            totalSeats: 4,
            costPerSeat: 350,
            status: "OPEN",
            driver: { id: "d-1", name: "Suresh Patil" },
            vehicle: { make: "Hyundai", model: "Creta", vehicleType: "SUV" },
          },
        }),
      });
    }

    if (path.includes("/api/rides")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [],
          meta: { total: 0, page: 1, limit: 20 },
        }),
      });
    }

    if (path.includes("/api/bookings")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [],
          meta: { total: 0, page: 1, limit: 20 },
        }),
      });
    }

    if (path.includes("/receipt")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            receiptNumber: "REC-12345",
            paidAt: new Date().toISOString(),
            payer: { name: "Passenger" },
            payee: { name: "Driver" },
            amount: 500,
            booking: { id: "bk-1", ride: { originText: "Mumbai", destText: "Pune" } },
          },
        }),
      });
    }

    if (path.includes("/api/payments")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            id: "pay-1",
            amount: 500,
            status: "PENDING",
            booking: { id: "bk-1", ride: { originText: "A", destText: "B" } },
          },
        }),
      });
    }

    if (path.includes("/api/notifications")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [],
          meta: { unreadCount: 0 },
        }),
      });
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: [] }),
    });
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("All Routes in Detail", () => {
  beforeEach(() => {
    setupFetchMock();
  });

  describe("Public Routes", () => {
    it("renders /terms legal page", () => {
      window.history.pushState({}, "", "/terms");
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
      expect(screen.getByRole("heading", { name: /Terms of service/i })).toBeInTheDocument();
    });

    it("renders /privacy legal page", () => {
      window.history.pushState({}, "", "/privacy");
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
      expect(screen.getByRole("heading", { name: /Privacy policy/i })).toBeInTheDocument();
    });

    it("renders / login page when unauthenticated", () => {
      window.history.pushState({}, "", "/");
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
      expect(screen.getByRole("heading", { name: /Welcome back\./i })).toBeInTheDocument();
    });
  });

  describe("Admin Routes", () => {
    beforeEach(() => {
      setSession(mockAdminUser);
    });

    it("renders / route for ADMIN as operations overview", async () => {
      window.history.pushState({}, "", "/");
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
      expect(await screen.findByRole("heading", { name: /Operations overview/i })).toBeInTheDocument();
    });

    it("renders /admin route as operations overview", async () => {
      window.history.pushState({}, "", "/admin");
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
      expect(await screen.findByRole("heading", { name: /Operations overview/i })).toBeInTheDocument();
    });

    it("renders /admin/verifications route for vehicle review", async () => {
      window.history.pushState({}, "", "/admin/verifications");
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
      expect(await screen.findByRole("heading", { name: /Verification queue/i })).toBeInTheDocument();
    });

    it("renders /admin/drivers route for driver review", async () => {
      window.history.pushState({}, "", "/admin/drivers");
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
      expect(await screen.findByRole("heading", { name: /Driver applications/i })).toBeInTheDocument();
    });

    it("renders /admin/pricing route for commission settings", async () => {
      window.history.pushState({}, "", "/admin/pricing");
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
      expect(await screen.findByRole("heading", { name: /Commission & Pricing/i })).toBeInTheDocument();
    });

    it("renders /admin/promo-codes route for promo codes management", async () => {
      window.history.pushState({}, "", "/admin/promo-codes");
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
      expect(await screen.findByRole("heading", { name: /Promo Codes Management/i })).toBeInTheDocument();
    });
  });

  describe("Vehicle and Document Routes", () => {
    it("renders /vehicles for USER", async () => {
      setSession(mockRegularUser);
      window.history.pushState({}, "", "/vehicles");
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
      expect(await screen.findByRole("heading", { name: /Your vehicle register/i })).toBeInTheDocument();
    });

    it("renders /vehicles for ADMIN as fleet overview", async () => {
      setSession(mockAdminUser);
      window.history.pushState({}, "", "/vehicles");
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
      expect(await screen.findByRole("heading", { name: /Vehicle overview/i })).toBeInTheDocument();
    });

    it("renders /documents for USER", async () => {
      setSession(mockRegularUser);
      window.history.pushState({}, "", "/documents");
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
      expect(await screen.findByRole("heading", { name: "Documents" })).toBeInTheDocument();
    });
  });

  describe("Ride and Booking Routes", () => {
    it("renders /rides/search for USER", async () => {
      setSession(mockRegularUser);
      window.history.pushState({}, "", "/rides/search");
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
      expect(await screen.findByRole("heading", { name: /Find a ride/i })).toBeInTheDocument();
    });

    it("renders /bookings for USER", async () => {
      setSession(mockRegularUser);
      window.history.pushState({}, "", "/bookings");
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
      expect(await screen.findByRole("heading", { name: /My bookings/i })).toBeInTheDocument();
    });

    it("renders /rides/mine for DRIVER", async () => {
      setSession(mockDriverUser);
      window.history.pushState({}, "", "/rides/mine");
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
      expect(await screen.findByRole("heading", { name: /My rides/i })).toBeInTheDocument();
    });

    it("renders /rides/post for DRIVER", async () => {
      setSession(mockDriverUser);
      window.history.pushState({}, "", "/rides/post");
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
      expect(await screen.findByRole("heading", { name: /Post a ride/i })).toBeInTheDocument();
    });

    it("blocks /rides/post for USER (redirects to LoginPage)", () => {
      setSession(mockRegularUser);
      window.history.pushState({}, "", "/rides/post");
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
      expect(screen.getByRole("heading", { name: /Welcome back\./i })).toBeInTheDocument();
    });
  });

  describe("Driver Management and Booking Action Routes", () => {
    it("renders /driver/requests for DRIVER", async () => {
      setSession(mockDriverUser);
      window.history.pushState({}, "", "/driver/requests");
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
      expect(await screen.findByRole("heading", { name: /Ride Booking Requests/i })).toBeInTheDocument();
    });

    it("renders /driver/rides/:id for DRIVER", async () => {
      setSession(mockDriverUser);
      window.history.pushState({}, "", "/driver/rides/ride-123");
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
      expect(await screen.findByRole("heading", { name: /Manage Scheduled Ride/i })).toBeInTheDocument();
    });

    it("renders /rides/:id ride details", async () => {
      setSession(mockRegularUser);
      window.history.pushState({}, "", "/rides/ride-123");
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
      expect(await screen.findByRole("heading", { name: /Mumbai to Pune/i })).toBeInTheDocument();
    });

    it("renders /rides/:id/track live tracking", async () => {
      setSession(mockRegularUser);
      window.history.pushState({}, "", "/rides/ride-123/track");
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
      expect(await screen.findByRole("heading", { name: /Live Ride Tracking/i })).toBeInTheDocument();
    });

    it("renders /payments/:id trip payment page", async () => {
      setSession(mockRegularUser);
      window.history.pushState({}, "", "/payments/pay-123");
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
      expect(await screen.findByRole("heading", { name: /Trip Payment/i })).toBeInTheDocument();
    });

    it("renders /receipts/:id receipt page", async () => {
      setSession(mockRegularUser);
      window.history.pushState({}, "", "/receipts/pay-123");
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
      expect(await screen.findByText(/REC-12345/i)).toBeInTheDocument();
    });
  });

  describe("Fallback 404 Route", () => {
    it("renders 404 page for unknown authenticated routes", () => {
      setSession(mockRegularUser);
      window.history.pushState({}, "", "/non-existent-page");
      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
      expect(screen.getByRole("heading", { name: /This route isn’t available\./i })).toBeInTheDocument();
    });
  });
});
