"use client";

import { useParams } from "next/navigation";
import { LoadErrorState } from "@/components/common/LoadErrorState";
import { parsePositiveId } from "@/lib/utils";
import { useRepair } from "@/features/repairs/hooks";
import { PostDetailSkeleton } from "@/features/posts/components/PostDetail";
import { RepairDetailView } from "@/features/repairs/components/RepairDetailView";

const BACK = { backHref: "/repairs", backLabel: "งานแจ้งซ่อม" };

/** /repairs/[id] */
export function RepairDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const repairId = parsePositiveId(id);
  const { data, isLoading, isError, error, refetch } = useRepair(repairId ?? 0);

  if (repairId === null) return <LoadErrorState notFound notFoundTitle="ไม่พบงานแจ้งซ่อมนี้" {...BACK} />;
  if (isLoading) return <PostDetailSkeleton />;
  if (isError || !data) {
    return <LoadErrorState error={error} notFoundTitle="ไม่พบงานแจ้งซ่อมนี้" onRetry={() => refetch()} {...BACK} />;
  }
  return <RepairDetailView post={data} />;
}
