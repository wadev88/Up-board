"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/features/auth/components/AuthProvider";
import { Toaster } from "@/components/ui/sonner";
import { isApiError } from "@/services/apiClient";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // SSE (hooks/useSSE.ts) invalidates what changes, so cached data stays
        // fresh for a minute and tab switches don't trigger a refetch storm.
        staleTime: 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: (failureCount, error) => {
          // never retry client errors (4xx); retry network/5xx twice
          if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
      <Toaster />
    </QueryClientProvider>
  );
}
