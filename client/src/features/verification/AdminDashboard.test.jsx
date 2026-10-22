import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../context/AuthContext";
import { AdminDashboardPage } from "./AdminDashboardPage";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

const mockStats = {
  users: 18,
  drivers: { APPROVED: 6, PENDING: 2, REJECTED: 1 },
  vehicles: { VERIFIED: 10, UNDER_REVIEW: 3, UNVERIFIED: 2 },
  documents: { PENDING: 4, APPROVED: 20 },
  activeRides: 3,
  upcomingRides: 7,
  reviews: 12,
  averageRating: 4.75,
};

describe("AdminDashboardPage", () => {
  it("renders the dense operational overview and switches sections", async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      const parsedUrl = new URL(url, "http://localhost");
      const section = parsedUrl.searchParams.get("section") || "USERS";

      if (section === "USERS") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              stats: mockStats,
              section: "USERS",
              items: [
                {
                  id: "user-1",
                  name: "Priya Sharma",
                  email: "priya@example.com",
                  phone: "9876543210",
                  role: "USER",
                  emailVerified: true,
                  createdAt: new Date().toISOString(),
                },
              ],
              total: 1,
              page: 1,
              limit: 15,
            },
            meta: { total: 1, page: 1, limit: 15 },
          }),
        });
      }

      if (section === "VEHICLES") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              stats: mockStats,
              section: "VEHICLES",
              items: [
                {
                  id: "veh-1",
                  make: "Toyota",
                  model: "Innova Crysta",
                  year: 2022,
                  registrationNumber: "MH02CB1234",
                  verificationStatus: "VERIFIED",
                  isAvailable: true,
                  owner: { name: "Rajesh Kumar", email: "rajesh@example.com" },
                  createdAt: new Date().toISOString(),
                },
              ],
              total: 1,
              page: 1,
              limit: 15,
            },
            meta: { total: 1, page: 1, limit: 15 },
          }),
        });
      }

      if (section === "DOCUMENTS") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              stats: mockStats,
              section: "DOCUMENTS",
              items: [
                {
                  id: "doc-1",
                  type: "RC",
                  documentNumber: "RC-998877",
                  status: "APPROVED",
                  expiryDate: new Date(Date.now() + 864000000).toISOString(),
                  vehicle: { make: "Toyota", model: "Innova", registrationNumber: "MH02CB1234" },
                  createdAt: new Date().toISOString(),
                },
              ],
              total: 1,
              page: 1,
              limit: 15,
            },
            meta: { total: 1, page: 1, limit: 15 },
          }),
        });
      }

      if (section === "REVIEWS") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              stats: mockStats,
              section: "REVIEWS",
              items: [
                {
                  id: "rev-1",
                  driver: { id: "d-1", name: "DriveHire Driver" },
                  reviewer: { name: "Priya Sharma" },
                  rating: 5,
                  comment: "Excellent driving and punctual.",
                  createdAt: new Date().toISOString(),
                },
              ],
              total: 1,
              page: 1,
              limit: 15,
            },
            meta: { total: 1, page: 1, limit: 15 },
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            stats: mockStats,
            section,
            items: [],
            total: 0,
            page: 1,
            limit: 15,
          },
          meta: { total: 0, page: 1, limit: 15 },
        }),
      });
    });

    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.setItem(
      "drivehire-session",
      JSON.stringify({
        token: "admin-jwt-token",
        user: { id: "admin-1", name: "DriveHire Administrator", role: "ADMIN" },
      }),
    );

    render(
      <AuthProvider>
        <AdminDashboardPage />
      </AuthProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Operations overview" }),
    ).toBeInTheDocument();
    expect(screen.getByText("USERS REGISTERED")).toBeInTheDocument();
    expect(screen.getByText("DRIVERS APPROVED")).toBeInTheDocument();
    expect(screen.getByText("VERIFIED VEHICLES")).toBeInTheDocument();
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();

    // Switch section to Vehicles directly from Users
    fireEvent.click(screen.getByRole("button", { name: "Vehicles" }));

    await waitFor(() => {
      expect(screen.getByText("Toyota Innova Crysta")).toBeInTheDocument();
      expect(screen.getByText("MH02CB1234")).toBeInTheDocument();
    });

    // Switch section to Documents directly from Vehicles
    fireEvent.click(screen.getByRole("button", { name: "Documents" }));

    await waitFor(() => {
      expect(screen.getByText("RC-998877")).toBeInTheDocument();
    });

    // Switch section to Reviews
    fireEvent.click(screen.getByRole("button", { name: "Reviews" }));

    await waitFor(() => {
      expect(
        screen.getByText("Excellent driving and punctual."),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("DriveHire Driver")).toBeInTheDocument();
  });
});
