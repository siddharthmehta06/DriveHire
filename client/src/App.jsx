import { useAuth } from './context/AuthContext';
import { LoginPage } from './features/auth/LoginPage';
import { VehicleDashboard } from './features/vehicles/VehicleDashboard';
import { LegalPage } from './pages/LegalPage';
import { DocumentPortalPage } from './features/documents/DocumentPortalPage';
import { AdminVerificationPage } from './features/verification/AdminVerificationPage';
import { PostRidePage } from './features/rides/pages/PostRidePage';
import { SearchRidesPage } from './features/rides/pages/SearchRidesPage';
import { MyRidesPage } from './features/rides/pages/MyRidesPage';
import { RideDetailPage } from './features/rides/pages/RideDetailPage';

export function ProtectedRoute({ roles, children }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <LoginPage />;
  return children;
}

export function App() {
  const { user } = useAuth();
  const pathname = window.location.pathname;

  if (pathname === '/terms') return <LegalPage type="terms" />;
  if (pathname === '/privacy') return <LegalPage type="privacy" />;
  if (!user) return <LoginPage />;
  if (pathname === '/rides/search') {
    return (
      <ProtectedRoute roles={['USER', 'DRIVER', 'ADMIN']}>
        <SearchRidesPage />
      </ProtectedRoute>
    );
  }
  if (pathname === '/rides/post') {
    return (
      <ProtectedRoute roles={['DRIVER']}>
        <PostRidePage />
      </ProtectedRoute>
    );
  }
  if (pathname === '/rides/mine') {
    return (
      <ProtectedRoute roles={['DRIVER']}>
        <MyRidesPage />
      </ProtectedRoute>
    );
  }
  if (/^\/rides\/[^/]+$/.test(pathname)) {
    return (
      <ProtectedRoute roles={['USER', 'DRIVER', 'ADMIN']}>
        <RideDetailPage />
      </ProtectedRoute>
    );
  }
  if (pathname === '/documents') {
    return (
      <ProtectedRoute roles={['USER', 'DRIVER', 'ADMIN']}>
        <DocumentPortalPage />
      </ProtectedRoute>
    );
  }
  if (pathname === '/admin/verifications' || pathname === '/admin/drivers') {
    return (
      <ProtectedRoute roles={['ADMIN']}>
        <AdminVerificationPage view={pathname === '/admin/drivers' ? 'drivers' : 'vehicles'} />
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute roles={['USER', 'DRIVER', 'ADMIN']}>
      <VehicleDashboard />
    </ProtectedRoute>
  );
}
