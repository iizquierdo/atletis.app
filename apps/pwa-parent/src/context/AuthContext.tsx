import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { mapAuthUser } from "../lib/data";
import { tokenStorage } from "../lib/token-storage";
import type { AuthUser } from "../types";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, persistent?: boolean) => Promise<void>;
  registerParent: (payload: ParentRegistrationPayload) => Promise<{ message: string }>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

export interface ParentRegistrationPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(tokenStorage.get());
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    tokenStorage.clear();
    setToken(null);
    setUser(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    const savedToken = tokenStorage.get();
    if (!savedToken) {
      setLoading(false);
      return;
    }

    try {
      const { data } = await api.get<{ user: unknown | null }>("/auth/session");
      if (!data?.user) {
        logout();
        return;
      }
      setToken(savedToken);
      setUser(mapAuthUser(data.user));
    } catch {
      logout();
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const login = useCallback(async (email: string, password: string, persistent = true) => {
    const { data } = await api.post<{ token: string; user: unknown }>("/auth/login", {
      email: email.toLowerCase(),
      password
    });

    tokenStorage.set(data.token, persistent);
    setToken(data.token);
    setUser(mapAuthUser(data.user));
  }, []);

  const registerParent = useCallback(async (payload: ParentRegistrationPayload) => {
    const { data } = await api.post<{ message?: string }>("/auth/register-parent", {
      ...payload,
      email: payload.email.toLowerCase()
    });

    return { message: data.message || "Te enviamos un email para activar tu cuenta." };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(user && token),
      login,
      registerParent,
      logout,
      refreshProfile
    }),
    [loading, login, logout, refreshProfile, registerParent, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
};
