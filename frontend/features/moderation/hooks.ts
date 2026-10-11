"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { moderationApi, type ReportListParams } from "@/features/moderation/api";
import { queryKeys } from "@/lib/queryKeys";
import { useInvalidatePosts } from "@/features/posts/hooks";
import type { CreateReportBody, UpdateReportBody } from "@/types/api";

export function useCreateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateReportBody) => moderationApi.create(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.reports.all }),
  });
}

export function useReports(params: ReportListParams) {
  return useQuery({
    queryKey: queryKeys.reports.list(params),
    queryFn: () => moderationApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useMyReports(params: { page?: number; page_size?: number }) {
  return useQuery({
    queryKey: queryKeys.reports.mine(params),
    queryFn: () => moderationApi.mine(params),
    placeholderData: keepPreviousData,
  });
}

export function useReport(id: number) {
  return useQuery({
    queryKey: queryKeys.reports.detail(id),
    queryFn: () => moderationApi.get(id),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useUpdateReport() {
  const qc = useQueryClient();
  const invalidatePosts = useInvalidatePosts();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateReportBody }) => moderationApi.update(id, body),
    onSuccess: (report) => {
      void qc.invalidateQueries({ queryKey: queryKeys.reports.all });
      void qc.invalidateQueries({ queryKey: queryKeys.admin.stats });
      // the reported post may have been removed: refresh it and every list
      if (report?.post) void qc.invalidateQueries({ queryKey: queryKeys.posts.detail(report.post.id), exact: true });
      invalidatePosts();
    },
  });
}
