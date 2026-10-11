"use client";

import { useParams } from "next/navigation";
import { LoadErrorState } from "@/components/common/LoadErrorState";
import { parsePositiveId } from "@/lib/utils";
import { usePost } from "@/features/posts/hooks";
import { PostDetail, PostDetailSkeleton } from "@/features/posts/components/PostDetail";

const BACK = { backHref: "/posts", backLabel: "โพสต์ทั้งหมด" };

/** /posts/[id] */
export function PostDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const postId = parsePositiveId(id);
  const { data, isLoading, isError, error, refetch } = usePost(postId ?? 0);

  if (postId === null) return <LoadErrorState notFound notFoundTitle="ไม่พบโพสต์นี้" {...BACK} />;
  if (isLoading) return <PostDetailSkeleton />;
  if (isError || !data) {
    return (
      <LoadErrorState
        error={error}
        notFoundTitle="ไม่พบโพสต์นี้"
        errorTitle="โหลดโพสต์ไม่สำเร็จ"
        onRetry={() => refetch()}
        {...BACK}
      />
    );
  }
  return <PostDetail post={data} {...BACK} />;
}
