"use client";

import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "@/features/dashboard/api";
import { queryKeys } from "@/lib/queryKeys";

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: dashboardApi.get,
    // Countdown chips change over time; refresh periodically as a fallback to SSE.
    refetchInterval: 5 * 60 * 1000,
  });
}
