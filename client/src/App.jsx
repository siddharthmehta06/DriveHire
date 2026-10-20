import { useState } from "react";
import { useAuth } from "./context/AuthContext";
import { LoginPage } from "./features/auth/LoginPage";
import { RegisterPage } from "./features/auth/RegisterPage";
import { VehicleDashboard } from "./features/vehicles/VehicleDashboard";
import { LegalPage } from "./pages/LegalPage";
import { DocumentPortalPage } from "./features/documents/DocumentPortalPage";
import { AdminVerificationPage } from "./features/verification/AdminVerificationPage";
import { AdminDashboardPage } from "./features/verification/AdminDashboardPage";
import { SearchRidesPage } from "./features/rides/pages/SearchRidesPage";
import { PostRidePage } from "./features/rides/pages/PostRidePage";
import { MyRidesPage } from "./features/rides/pages/MyRidesPage";
import { RideDetailPage } from "./features/rides/pages/RideDetailPage";
import { MyBookingsPage } from "./features/bookings/pages/MyBookingsPage";
import { TrackRidePage } from "./features/bookings/pages/TrackRidePage";
import { RideRequestsPage } from "./features/bookings/pages/RideRequestsPage";
import { DriverRideManagePage } from "./features/bookings/pages/DriverRideManagePage";
import { PaymentPage } from "./features/payments/pages/PaymentPage";
import { ReceiptPage } from "./features/payments/pages/ReceiptPage";
import { AdminCommissionPage } from "./features/payments/pages/AdminCommissionPage";
import { AdminPromoCodesPage } from "./features/payments/pages/AdminPromoCodesPage";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";

function NotFoundPage({ user, signOut }) {
  return (
    <div className="workspace">
      <WorkspaceSidebar signOut={signOut} user={user} />
      <main className="workspace-main">
        <div className="dashboard-content">
          <section className="empty-register" aria-labelledby="not-found-title">
            <p className="eyebrow">PAGE NOT FOUND / 404</p>
            <h1 id="not-found-title">This route isn’t available.</h1>
            <p>Use the workspace navigation to continue.</p>
            <a className="button button--primary" href="/">
              Return to your workspace
            </a>
          </section>
        </div>
      </main>
    </div>
  );
}

export function ProtectedRoute({ roles, children }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <LoginPage />;
  return children;
}

export function App() {
  const { user, signOut } = useAuth();
  const pathname = window.location.pathname;
  const [authMode, setAuthMode] = useState("login");

  if (pathname === "/terms") return <LegalPage type="terms" />;
  if (pathname === "/privacy") return <LegalPage type="privacy" />;
  if (!user) {
    return authMode === "register" ? (
      <RegisterPage onSwitchToLogin={() => setAuthMode("login")} />
    ) : (
      <LoginPage onSwitchToRegister={() => setAuthMode("register")} />
    );
  }
  if (pathname === "/admin") {
    return (
      <ProtectedRoute roles={["ADMIN"]}>
        <AdminDashboardPage />
      </ProtectedRoute>
    );
  }
  if (pathname === "/vehicles") {
    return (
      <ProtectedRoute roles={["USER", "DRIVER", "ADMIN"]}>
        <VehicleDashboard />
      </ProtectedRoute>
    );
  }
  if (pathname === "/") {
    if (user.role === "ADMIN") return <AdminDashboardPage />;
    if (user.role === "DRIVER") return <MyRidesPage />;
    return <SearchRidesPage />;
  }
  if (pathname === "/rides/search") {
    return (
      <ProtectedRoute roles={["USER", "DRIVER", "ADMIN"]}>
        <SearchRidesPage />
      </ProtectedRoute>
    );
  }
  if (pathname === "/rides/post") {
    return (
      <ProtectedRoute roles={["DRIVER"]}>
        <PostRidePage />
      </ProtectedRoute>
    );
  }
  if (pathname === "/rides/mine") {
    return (
      <ProtectedRoute roles={["DRIVER"]}>
        <MyRidesPage />
      </ProtectedRoute>
    );
  }
  if (pathname === "/bookings") {
    return (
      <ProtectedRoute roles={["USER", "DRIVER", "ADMIN"]}>
        <MyBookingsPage />
      </ProtectedRoute>
    );
  }
  if (/^\/rides\/[^/]+\/track$/.test(pathname)) {
    return (
      <ProtectedRoute roles={["USER", "DRIVER", "ADMIN"]}>
        <TrackRidePage />
      </ProtectedRoute>
    );
  }
  if (pathname === "/driver/requests") {
    return (
      <ProtectedRoute roles={["DRIVER"]}>
        <RideRequestsPage />
      </ProtectedRoute>
    );
  }
  if (/^\/driver\/rides\/[^/]+$/.test(pathname)) {
    return (
      <ProtectedRoute roles={["DRIVER"]}>
        <DriverRideManagePage />
      </ProtectedRoute>
    );
  }
  if (/^\/rides\/[^/]+$/.test(pathname)) {
    return (
      <ProtectedRoute roles={["USER", "DRIVER", "ADMIN"]}>
        <RideDetailPage />
      </ProtectedRoute>
    );
  }
  if (pathname === "/documents") {
    return (
      <ProtectedRoute roles={["USER", "DRIVER", "ADMIN"]}>
        <DocumentPortalPage />
      </ProtectedRoute>
    );
  }
  if (pathname === "/admin/verifications" || pathname === "/admin/drivers") {
    return (
      <ProtectedRoute roles={["ADMIN"]}>
        <AdminVerificationPage
          view={pathname === "/admin/drivers" ? "drivers" : "vehicles"}
        />
      </ProtectedRoute>
    );
  }
  if (/^\/payments\/[^/]+$/.test(pathname)) {
    return (
      <ProtectedRoute roles={["USER", "DRIVER", "ADMIN"]}>
        <PaymentPage />
      </ProtectedRoute>
    );
  }
  if (/^\/receipts\/[^/]+$/.test(pathname)) {
    return (
      <ProtectedRoute roles={["USER", "DRIVER", "ADMIN"]}>
        <ReceiptPage />
      </ProtectedRoute>
    );
  }
  if (pathname === "/admin/pricing") {
    return (
      <ProtectedRoute roles={["ADMIN"]}>
        <AdminCommissionPage />
      </ProtectedRoute>
    );
  }
  if (pathname === "/admin/promo-codes") {
    return (
      <ProtectedRoute roles={["ADMIN"]}>
        <AdminPromoCodesPage />
      </ProtectedRoute>
    );
  }

  return <NotFoundPage signOut={signOut} user={user} />;
}
