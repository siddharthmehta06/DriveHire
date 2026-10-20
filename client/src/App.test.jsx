import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";
import { AuthProvider } from "./context/AuthContext";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.pushState({}, "", "/");
  vi.unstubAllGlobals();
});

describe("role-specific workspace navigation", () => {
  it("keeps the User navigation focused on rides and bookings", () => {
    window.history.pushState({}, "", "/rides/search");
    render(
      <WorkspaceSidebar
        signOut={() => {}}
        user={{ name: "Passenger User", role: "USER" }}
      />,
    );
    const navigation = screen.getByRole("navigation", {
      name: "Main navigation",
    });

    expect(
      within(navigation).getByRole("link", { name: /search rides/i }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(navigation).getByRole("link", { name: /my bookings/i }),
    ).toBeInTheDocument();
    expect(
      within(navigation).queryByRole("link", {
        name: /vehicle register|documents|driver review/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps Driver ride, vehicle, and document tools available on every route", () => {
    window.history.pushState({}, "", "/driver/requests");
    render(
      <WorkspaceSidebar
        signOut={() => {}}
        user={{ name: "DriveHire Driver", role: "DRIVER" }}
      />,
    );
    const navigation = screen.getByRole("navigation", {
      name: "Main navigation",
    });

    expect(
      within(navigation).getByRole("link", { name: /ride requests/i }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(navigation).getByRole("link", { name: /post a ride/i }),
    ).toBeInTheDocument();
    expect(
      within(navigation).getByRole("link", { name: /vehicle register/i }),
    ).toBeInTheDocument();
    expect(
      within(navigation).getByRole("link", { name: /documents/i }),
    ).toBeInTheDocument();
    expect(
      within(navigation).queryByRole("link", {
        name: /driver review|commission/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps Admin operations links and marks the current review section", () => {
    window.history.pushState({}, "", "/admin/drivers");
    render(
      <WorkspaceSidebar
        signOut={() => {}}
        user={{ name: "DriveHire Admin", role: "ADMIN" }}
      />,
    );
    const navigation = screen.getByRole("navigation", {
      name: "Main navigation",
    });

    expect(
      within(navigation).getByRole("link", { name: /driver review/i }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(navigation).getByRole("link", { name: /vehicle review/i }),
    ).toBeInTheDocument();
    expect(
      within(navigation).getByRole("link", { name: /commission/i }),
    ).toBeInTheDocument();
    expect(
      within(navigation).queryByRole("link", {
        name: /post a ride|ride requests/i,
      }),
    ).not.toBeInTheDocument();
  });
});

describe("DriveHire access screen", () => {
  it("does not ask for account type at sign-in and routes by the returned account role", async () => {
    const fetchMock = vi.fn().mockImplementation((url) => ({
      ok: true,
      status: 200,
      json: async () =>
        url === "/api/auth/login"
          ? {
              success: true,
              data: {
                token: "session-token",
                user: {
                  id: "admin-id",
                  name: "DriveHire Admin",
                  email: "admin@example.com",
                  role: "ADMIN",
                },
              },
            }
          : url.includes("/api/admin/dashboard")
            ? {
                success: true,
                data: {
                  section: "USERS",
                  stats: {
                    users: 12,
                    drivers: { APPROVED: 4, PENDING: 1 },
                    vehicles: { VERIFIED: 8, UNDER_REVIEW: 2 },
                    documents: { PENDING: 3 },
                    activeRides: 2,
                    upcomingRides: 5,
                    reviews: 10,
                    averageRating: 4.8,
                  },
                  items: [],
                  total: 0,
                  page: 1,
                  limit: 15,
                },
                meta: { total: 0, page: 1, limit: 15 },
              }
          : {
              success: true,
              data: [],
              meta: { total: 0, page: 1, limit: 100 },
            },
    }));
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.clear();

    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Welcome back." }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Owner" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Driver" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Admin" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "admin@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "DriveHire2026!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Operations overview" }),
      ).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/login");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      email: "admin@example.com",
      password: "DriveHire2026!",
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/api/admin/dashboard"),
        expect.stringContaining("/api/notifications"),
      ]),
    );
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    expect(
      await screen.findByText("Your account has no notifications yet."),
    ).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("shows an explicit not-found page for an unknown authenticated route", () => {
    window.history.pushState({}, "", "/this-route-does-not-exist");
    window.localStorage.setItem(
      "drivehire-session",
      JSON.stringify({
        token: "session-token",
        user: { id: "user-id", name: "Passenger User", role: "USER" },
      }),
    );

    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "This route isn’t available." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Return to your workspace" }),
    ).toHaveAttribute("href", "/");
  });

  it("registers an account directly and persists the session", async () => {
    const fetchMock = vi.fn().mockImplementation((url) => ({
      ok: true,
      status: 201,
      json: async () => {
        if (url.endsWith("/register")) {
          return {
            success: true,
            data: {
              token: "registered-session",
              user: {
                id: "new-user",
                name: "New Owner",
                email: "new@example.com",
                role: "USER",
              },
            },
          };
        }
        return { success: true, data: [], meta: { unreadCount: 0 } };
      },
    }));
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.clear();
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /create one now/i }));
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "New Owner" },
    });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "CorrectHorse9!" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "CorrectHorse9!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(
        JSON.parse(window.localStorage.getItem("drivehire-session")).token,
      ).toBe("registered-session"),
    );
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(
      expect.arrayContaining([
        "/api/auth/register",
        expect.stringContaining("/api/rides?"),
        expect.stringContaining("/api/notifications?"),
      ]),
    );
    vi.unstubAllGlobals();
  });

  it("renders the protected document register and its role-specific upload fields", async () => {
    const fetchMock = vi.fn().mockImplementation((url) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.includes("/api/vehicles")
          ? {
              success: true,
              data: [
                {
                  id: "vehicle-1",
                  make: "Toyota",
                  model: "Innova",
                  registrationNumber: "MH12AB1234",
                },
              ],
            }
          : {
              success: true,
              data: [],
              meta: { total: 0, page: 1, limit: 100, unreadCount: 0 },
            },
    }));
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.setItem(
      "drivehire-session",
      JSON.stringify({
        token: "document-session",
        user: {
          id: "owner-id",
          name: "Vehicle Owner",
          email: "owner@example.com",
          role: "USER",
        },
      }),
    );
    window.history.pushState({}, "", "/documents");

    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Documents" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Document type")).toBeInTheDocument();
    expect(screen.getByLabelText("Vehicle")).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Document type")).queryByRole("option", {
        name: "Driving licence",
      }),
    ).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/api/documents"),
        "/api/vehicles?page=1&limit=100",
        expect.stringContaining("/api/notifications"),
      ]),
    );

    window.history.pushState({}, "", "/");
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("shows the administrator verification queue and requires a rejection reason", async () => {
    const vehicle = {
      id: "vehicle-review-1",
      make: "Toyota",
      model: "Innova",
      year: 2024,
      registrationNumber: "MH12AB1234",
      owner: {
        id: "owner-1",
        name: "Vehicle Owner",
        email: "owner@example.com",
        phone: "9999999999",
      },
      documents: [
        {
          id: "document-review-1",
          type: "RC",
          documentNumber: "RC-100",
          expiryDate: "2027-12-31T00:00:00.000Z",
          status: "PENDING",
          originalName: "rc.pdf",
        },
      ],
      audit: [
        {
          id: "audit-1",
          action: "SUBMITTED",
          createdAt: "2026-10-11T00:00:00.000Z",
        },
      ],
    };
    const fetchMock = vi.fn().mockImplementation((url, options = {}) => {
      const rejected = url.includes("/reject");
      return {
        ok: true,
        status: 200,
        json: async () => {
          if (url.includes("/api/admin/verifications?"))
            return { success: true, data: rejected ? [] : [vehicle] };
          if (url.includes("/api/admin/verifications/"))
            return { success: true, data: vehicle };
          if (url.includes("/api/notifications"))
            return { success: true, data: [], meta: { unreadCount: 0 } };
          return { success: true, data: { id: "document-review-1" } };
        },
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.setItem(
      "drivehire-session",
      JSON.stringify({
        token: "admin-session",
        user: {
          id: "admin-id",
          name: "DriveHire Admin",
          email: "admin@example.com",
          role: "ADMIN",
        },
      }),
    );
    window.history.pushState({}, "", "/admin/verifications");

    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Verification queue" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Toyota Innova" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("/private/uploads/rc.pdf"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: "Registration details are unreadable." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm rejection" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) =>
          url.includes("/admin/documents/document-review-1/reject"),
        ),
      ).toBe(true),
    );
    expect(
      fetchMock.mock.calls.some(
        ([, options]) =>
          options?.body ===
          JSON.stringify({ reason: "Registration details are unreadable." }),
      ),
    ).toBe(true);

    window.history.pushState({}, "", "/");
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("lets a vehicle owner submit an unverified vehicle for administrator review", async () => {
    const vehicle = {
      id: "vehicle-submit-1",
      make: "Toyota",
      model: "Corolla",
      year: 2024,
      registrationNumber: "MH12AB1234",
      vehicleType: "SEDAN",
      seatCapacity: 4,
      photoUrls: [],
      verificationStatus: "UNVERIFIED",
      isAvailable: true,
      createdAt: "2026-10-11T00:00:00.000Z",
    };
    const fetchMock = vi.fn().mockImplementation((url) => ({
      ok: true,
      status: 200,
      json: async () => {
        if (url.includes("/api/notifications"))
          return { success: true, data: [], meta: { unreadCount: 0 } };
        if (url.includes("/submit-verification"))
          return {
            success: true,
            data: { ...vehicle, verificationStatus: "UNDER_REVIEW" },
          };
        return {
          success: true,
          data: [vehicle],
          meta: { total: 1, page: 1, limit: 100 },
        };
      },
    }));
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.setItem(
      "drivehire-session",
      JSON.stringify({
        token: "owner-session",
        user: {
          id: "owner-id",
          name: "Vehicle Owner",
          email: "owner@example.com",
          role: "USER",
        },
      }),
    );
    window.history.pushState({}, "", "/vehicles");

    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    expect(await screen.findByText("Toyota Corolla")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "View Toyota Corolla" }),
    );
    expect(
      await screen.findByRole("region", {
        name: "Vehicle verification timeline",
      }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Submit for verification" }),
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) =>
          url.includes("/submit-verification"),
        ),
      ).toBe(true),
    );
    expect(await screen.findByText("Administrator review")).toBeInTheDocument();

    window.localStorage.clear();
    vi.unstubAllGlobals();
  });
});
