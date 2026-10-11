"use client";

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { repairsApi, type RepairListParams } from "@/features/repairs/api";
import { useInvalidatePosts, useRefreshMeOnSpamError } from "@/features/posts/hooks";
import { queryKeys } from "@/lib/queryKeys";
import type { CreateRepairBody, Priority, UpdateRepairStatusBody } from "@/types/api";

export function useRepairs(params: RepairListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.repairs.list(params),
    queryFn: () => repairsApi.list(params),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useRepair(id: number) {
  return useQuery({
    queryKey: queryKeys.posts.detail(id),
    queryFn: () => repairsApi.get(id),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useCreateRepair() {
  const invalidate = useInvalidatePosts();
  const onSpamError = useRefreshMeOnSpamError();
  return useMutation({
    onError: onSpamError,
    mutationFn: (body: CreateRepairBody) => repairsApi.create(body),
    onSuccess: (post) => invalidate(post),
  });
}

export function useUpdateRepairStatus(id: number) {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: (body: UpdateRepairStatusBody) => repairsApi.updateStatus(id, body),
    onSuccess: (post) => invalidate(post),
  });
}

export function useAssignRepair(id: number) {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: (technicianId: number) => repairsApi.assign(id, technicianId),
    onSuccess: (post) => invalidate(post),
  });
}

export function useSetRepairPriority(id: number) {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: (priority: Priority) => repairsApi.setPriority(id, priority),
    onSuccess: (post) => invalidate(post),
  });
}

export function useTechnicians(enabled = true) {
  return useQuery({
    queryKey: queryKeys.technicians,
    queryFn: repairsApi.technicians,
    enabled,
  });
}
