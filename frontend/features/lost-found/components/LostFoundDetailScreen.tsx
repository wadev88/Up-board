"use client";

import { useParams } from "next/navigation";
import { LoadErrorState } from "@/components/common/LoadErrorState";
import { parsePositiveId } from "@/lib/utils";
import { useLostFoundItem } from "@/features/lost-found/hooks";
import { PostDetailSkeleton } from "@/features/posts/components/PostDetail";
import { LostFoundDetailView } from "@/features/lost-found/components/LostFoundDetailView";

const BACK = { backHref: "/lost-found", backLabel: "ของหาย/พบของ" };

/** /lost-found/[id] */
export function LostFoundDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const itemId = parsePositiveId(id);
  const { data, isLoading, isError, error, refetch } = useLostFoundItem(itemId ?? 0);

  if (itemId === null) return <LoadErrorState notFound notFoundTitle="ไม่พบประกาศนี้" {...BACK} />;
  if (isLoading) return <PostDetailSkeleton />;
  if (isError || !data) {
    return <LoadErrorState error={error} notFoundTitle="ไม่พบประกาศนี้" onRetry={() => refetch()} {...BACK} />;
  }
  return <LostFoundDetailView post={data} />;
}
