import { useAuth } from './context/AuthContext';
import { LoginPage } from './features/auth/LoginPage';
import { VehicleDashboard } from './features/vehicles/VehicleDashboard';
import { LegalPage } from './pages/LegalPage';
import { DocumentPortalPage } from './features/documents/DocumentPortalPage';

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
  if (pathname === '/documents') {
    return (
      <ProtectedRoute roles={['USER', 'DRIVER', 'ADMIN']}>
        <DocumentPortalPage />
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute roles={['USER', 'DRIVER', 'ADMIN']}>
      <VehicleDashboard />
    </ProtectedRoute>
  );
}
