import {
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";
import { apiRequest } from "../api/http";

const AuthContext = createContext(null);
const ROLE_HOME = {
  USER: "/rides/search",
  DRIVER: "/rides/mine",
  ADMIN: "/admin",
};
export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("drivehire-session") || "null");
    } catch {
      return null;
    }
  });


  async function signIn(credentials) {
    const result = await apiRequest("/auth/login", {
      method: "POST",
      body: credentials,
    });
    const nextSession = result.data;
    localStorage.setItem("drivehire-session", JSON.stringify(nextSession));
    setSession(nextSession);
    window.history.replaceState(
      {},
      "",
      ROLE_HOME[nextSession.user.role] || "/",
    );
  }

  async function signUp(credentials) {
    const result = await apiRequest("/auth/register", {
      method: "POST",
      body: credentials,
    });
    const nextSession = result.data;
    localStorage.setItem("drivehire-session", JSON.stringify(nextSession));
    setSession(nextSession);
    window.history.replaceState(
      {},
      "",
      ROLE_HOME[nextSession.user.role] || "/",
    );
    return result;
  }

  function signOut() {
    localStorage.removeItem("drivehire-session");
    setSession(null);
  }

  const value = useMemo(
    () => ({
      user: session?.user || null,
      token: session?.token || null,
      signIn,
      signUp,
      signOut,
    }),
    [session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}
