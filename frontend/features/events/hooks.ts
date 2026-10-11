"use client";

import { useQuery } from "@tanstack/react-query";
import { eventsApi, type EventRange } from "@/features/events/api";
import { queryKeys } from "@/lib/queryKeys";

export function useEvents(range: EventRange = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.events(range),
    queryFn: () => eventsApi.list(range),
    enabled: options.enabled ?? true,
  });
}
