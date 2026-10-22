import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../context/AuthContext";
import { AdminVerificationPage } from "./AdminVerificationPage";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

const mockDriverPending = {
  userId: "driver-u1",
  licenseNumber: "DL-12345678",
  backgroundCheckStatus: "PENDING",
  user: {
    id: "driver-u1",
    name: "Aman Verma",
    email: "aman@example.com",
    phone: "9123456780",
    vehicleDocuments: [
      {
        id: "doc-lic-1",
        type: "LICENSE",
        documentNumber: "DL-12345678",
        status: "PENDING",
        expiryDate: new Date(Date.now() + 864000000).toISOString(),
        originalName: "driving-licence.pdf",
      },
    ],
  },
};

describe("AdminVerificationPage - Driver review flow (/admin/drivers)", () => {
  it("renders pending drivers and supports license and driver approval without throwing", async () => {
    const fetchMock = vi.fn().mockImplementation((url, options) => {
      const parsedUrl = new URL(url, "http://localhost");

      if (parsedUrl.pathname === "/api/admin/drivers") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: [mockDriverPending],
          }),
        });
      }

      if (parsedUrl.pathname === "/api/admin/documents/doc-lic-1/approve") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { id: "doc-lic-1", status: "APPROVED" },
          }),
        });
      }

      if (parsedUrl.pathname === "/api/admin/drivers/driver-u1/approve") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { userId: "driver-u1", backgroundCheckStatus: "APPROVED" },
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
    window.localStorage.setItem(
      "drivehire-session",
      JSON.stringify({
        token: "admin-jwt-token",
        user: { id: "admin-1", name: "DriveHire Admin", role: "ADMIN" },
      }),
    );

    render(
      <AuthProvider>
        <AdminVerificationPage view="drivers" />
      </AuthProvider>,
    );

    // Verify header and driver queue item
    expect(
      await screen.findByRole("heading", { name: "Driver applications" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Aman Verma").length).toBeGreaterThan(0);
    expect(screen.getAllByText("aman@example.com").length).toBeGreaterThan(0);

    // Verify detail section loaded without ReferenceError on saving
    expect(screen.getByText("DL-12345678")).toBeInTheDocument();
    const approveLicenseBtn = screen.getByRole("button", { name: "Approve licence" });
    expect(approveLicenseBtn).toBeInTheDocument();
    expect(approveLicenseBtn).not.toBeDisabled();

    // Approve driver button should be disabled because license is still PENDING
    const approveDriverBtn = screen.getByRole("button", { name: "Approve driver" });
    expect(approveDriverBtn).toBeDisabled();

    // Click Approve licence
    fireEvent.click(approveLicenseBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/admin/documents/doc-lic-1/approve"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
