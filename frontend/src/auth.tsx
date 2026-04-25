import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, ApiUser } from "./api";
import { tokenStorage } from "./storage";

type AuthState = {
  user: ApiUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<ApiUser>;
  signUp: (email: string, password: string) => Promise<ApiUser>;
  signOut: () => Promise<void>;
  refresh: () => Promise<ApiUser | null>;
  setUser: (u: ApiUser | null) => void;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const token = await tokenStorage.get();
      if (!token) {
        setUser(null);
        return null;
      }
      const me = await api.me();
      setUser(me);
      return me;
    } catch {
      await tokenStorage.clear();
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const signIn = async (email: string, password: string) => {
    const res = await api.login(email, password);
    await tokenStorage.set(res.access_token);
    setUser(res.user);
    return res.user;
  };

  const signUp = async (email: string, password: string) => {
    const res = await api.register(email, password);
    await tokenStorage.set(res.access_token);
    setUser(res.user);
    return res.user;
  };

  const signOut = async () => {
    await tokenStorage.clear();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
