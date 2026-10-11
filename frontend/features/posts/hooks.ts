"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { postsApi, type HistoryParams, type PostListParams } from "@/features/posts/api";
import { authApi } from "@/features/auth/api";
import { useAuth } from "@/hooks/useAuth";
import { queryKeys } from "@/lib/queryKeys";
import { applyPostMutation } from "@/lib/invalidation";
import { isApiError } from "@/services/apiClient";
import { formatDateTime } from "@/lib/format";
import { toast } from "sonner";
import type { CreatePostBody, Post, UpdatePostBody } from "@/types/api";

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: postsApi.categories,
    staleTime: 60 * 60 * 1000,
  });
}

export function usePosts(params: PostListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.posts.list(params),
    queryFn: () => postsApi.list(params),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

/** Post History (GET /me/posts); cached under posts.lists so every post mutation refreshes it. */
export function usePostHistory(params: HistoryParams) {
  return useQuery({
    queryKey: queryKeys.posts.list({ history: true, ...params }),
    queryFn: () => postsApi.history(params),
    placeholderData: keepPreviousData,
  });
}

/**
 * After POSTING_SUSPENDED / POSTING_TOO_FAST, reload the profile so the suspension banner and
 * disabled Create Post controls reflect the server's state.
 */
export function useRefreshMeOnSpamError() {
  const { setUser } = useAuth();
  return (error: unknown) => {
    if (isApiError(error) && error.code === "POSTING_SUSPENDED") {
      authApi.me().then(setUser, () => undefined);
    }
  };
}

/** Toast for the spam policy result of a create (warning at 3 in a row, suspension at 5). */
export function useSpamNoticeToast() {
  const { setUser } = useAuth();
  return (post: Post) => {
    const n = post.spam_notice;
    if (!n) return;
    if (n.action === "warning") {
      toast.warning(`คำเตือน: คุณโพสต์ทั่วไปติดต่อกัน ${n.count} ครั้งในวันนี้`, {
        description: "หากโพสต์ทั่วไปติดต่อกันถึง 5 ครั้ง บัญชีจะถูกระงับการโพสต์ 1 วัน (โพสต์ประเภทอื่นช่วยให้นับใหม่)",
        duration: 10000,
      });
    } else {
      toast.error(`บัญชีถูกระงับการโพสต์ (โพสต์ทั่วไปติดต่อกัน ${n.count} ครั้ง)`, {
        description: n.suspended_until ? `โพสต์ได้อีกครั้ง ${formatDateTime(n.suspended_until)}` : undefined,
        duration: 12000,
      });
      authApi.me().then(setUser, () => undefined);
    }
  };
}

export function usePost(id: number) {
  return useQuery({
    queryKey: queryKeys.posts.detail(id),
    queryFn: () => postsApi.get(id),
    enabled: Number.isFinite(id) && id > 0,
  });
}

/**
 * Shared post-mutation cache update: writes the returned post into its detail
 * cache and invalidates posts / repairs / lost-found lists, dashboard and
 * events — never the detail that was just written (see lib/invalidation.ts).
 */
export function useInvalidatePosts() {
  const qc = useQueryClient();
  return (post?: Post) => applyPostMutation(qc, post);
}

export function useCreatePost() {
  const invalidate = useInvalidatePosts();
  const onSpamError = useRefreshMeOnSpamError();
  const spamToast = useSpamNoticeToast();
  return useMutation({
    mutationFn: (body: CreatePostBody) => postsApi.create(body),
    onSuccess: (post) => {
      invalidate(post);
      spamToast(post);
    },
    onError: onSpamError,
  });
}

export function useUpdatePost(id: number) {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: (body: UpdatePostBody) => postsApi.update(id, body),
    onSuccess: (post) => invalidate(post),
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: (id: number) => postsApi.remove(id),
    onSuccess: (_data, id) => {
      // mark stale without refetching (the page is navigating away from the deleted post)
      void qc.invalidateQueries({ queryKey: queryKeys.posts.detail(id), exact: true, refetchType: "none" });
      invalidate();
    },
  });
}

export function usePinPost(id: number) {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: (hours?: number) => postsApi.pin(id, hours),
    onSuccess: (post) => invalidate(post),
  });
}

export function useUnpinPost(id: number) {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: () => postsApi.unpin(id),
    onSuccess: (post) => invalidate(post),
  });
}
