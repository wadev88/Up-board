import * as React from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthContext, type AuthContextValue } from "@/features/auth/context";
import type { User } from "@/types/api";

/** Render with a fake auth context and a fresh QueryClient. */
export function renderWithAuth(ui: React.ReactElement, user: User | null = null) {
  const value: AuthContextValue = {
    status: user ? "authenticated" : "unauthenticated",
    user,
    login: async () => user as User,
    signInWithTokens: () => user as User,
    logout: async () => {},
    setUser: () => {},
  };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={value}>{ui}</AuthContext.Provider>
    </QueryClientProvider>,
  );
}
