import { useAuth } from './context/AuthContext';
import { LoginPage } from './features/auth/LoginPage';
import { VehicleDashboard } from './features/vehicles/VehicleDashboard';
import { LegalPage } from './pages/LegalPage';

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

  return (
    <ProtectedRoute roles={['USER', 'DRIVER', 'ADMIN']}>
      <VehicleDashboard />
    </ProtectedRoute>
  );
}
