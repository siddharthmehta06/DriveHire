import { createContext, useContext, useMemo, useState } from 'react';
import { apiRequest } from '../api/http';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('drivehire-session') || 'null');
    } catch {
      return null;
    }
  });

  async function signIn(credentials) {
    const result = await apiRequest('/auth/login', {
      method: 'POST',
      body: credentials,
    });
    const nextSession = result.data;
    localStorage.setItem('drivehire-session', JSON.stringify(nextSession));
    setSession(nextSession);
  }

  function signOut() {
    localStorage.removeItem('drivehire-session');
    setSession(null);
  }

  const value = useMemo(() => ({
    user: session?.user || null,
    token: session?.token || null,
    signIn,
    signOut,
  }), [session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider.');
  return context;
}
