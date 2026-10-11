"use client";

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { lostFoundApi, type LostFoundListParams } from "@/features/lost-found/api";
import { useInvalidatePosts, useRefreshMeOnSpamError } from "@/features/posts/hooks";
import { queryKeys } from "@/lib/queryKeys";
import type { CreateLostFoundBody, UpdateLostFoundBody } from "@/types/api";

export function useLostFoundList(params: LostFoundListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.lostFound.list(params),
    queryFn: () => lostFoundApi.list(params),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useLostFoundItem(id: number) {
  return useQuery({
    queryKey: queryKeys.posts.detail(id),
    queryFn: () => lostFoundApi.get(id),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useCreateLostFound() {
  const invalidate = useInvalidatePosts();
  const onSpamError = useRefreshMeOnSpamError();
  return useMutation({
    onError: onSpamError,
    mutationFn: (body: CreateLostFoundBody) => lostFoundApi.create(body),
    onSuccess: (post) => invalidate(post),
  });
}

export function useUpdateLostFound(id: number) {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: (body: UpdateLostFoundBody) => lostFoundApi.update(id, body),
    onSuccess: (post) => invalidate(post),
  });
}
