
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AuthContext, type AuthContextValue, type AuthStatus } from "@/features/auth/context";
import { authApi } from "@/features/auth/api";
import { refreshSession, setSessionHandlers, tokenStore } from "@/services/apiClient";
import type { LoginBody, TokenResponse, User } from "@/types/api";

/**
 * Session state. The access token lives only in memory (tokenStore); on first
 * load we call POST /auth/refresh (httpOnly cookie) to restore the session.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUserState] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    setSessionHandlers({
      onRefreshed: (res) => {
        setUserState(res.user);
        setStatus("authenticated");
      },
      onSessionExpired: () => {
        setUserState(null);
        setStatus("unauthenticated");
        queryClient.clear();
      },
    });
    let cancelled = false;
    refreshSession().then((res) => {
      if (cancelled) return;
      if (res) {
        setUserState(res.user);
        setStatus("authenticated");
      } else {
        setStatus("unauthenticated");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  const signInWithTokens = useCallback(
    (res: TokenResponse) => {
      tokenStore.set(res.access_token);
      queryClient.clear();
      setUserState(res.user);
      setStatus("authenticated");
      return res.user;
    },
    [queryClient],
  );

  const login = useCallback(
    async (body: LoginBody) => signInWithTokens(await authApi.login(body)),
    [signInWithTokens],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* cookie may already be gone — still clear local state */
    }
    tokenStore.clear();
    queryClient.clear();
    setUserState(null);
    setStatus("unauthenticated");
  }, [queryClient]);

  const setUser = useCallback((u: User) => setUserState(u), []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, signInWithTokens, logout, setUser }),
    [status, user, login, signInWithTokens, logout, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
