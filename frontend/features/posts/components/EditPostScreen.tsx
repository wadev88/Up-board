"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadErrorState } from "@/components/common/LoadErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { parsePositiveId } from "@/lib/utils";
import { Can } from "@/features/auth/components/Guards";
import { usePost } from "@/features/posts/hooks";
import { PostForm } from "@/features/posts/components/PostForm";
import { PostDetailSkeleton } from "@/features/posts/components/PostDetail";
import { postHref } from "@/features/posts/utils";

const BACK = { backHref: "/posts", backLabel: "โพสต์ทั้งหมด" };

/** /posts/[id]/edit — same 404 / error / back-link handling as the detail pages. */
export function EditPostScreen() {
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
  return (
    <div className="mx-auto max-w-[720px]">
      <Button asChild variant="ghost" size="sm" className="-ml-3 mb-4">
        <Link href={postHref(data)}>
          <ArrowLeft aria-hidden="true" />
          กลับไปที่โพสต์
        </Link>
      </Button>
      <PageHeader title="แก้ไขโพสต์" description={data.title} />
      <Can
        perm="post:update"
        post={data}
        fallback={<ErrorState icon={<ShieldOff />} title="ไม่มีสิทธิ์แก้ไขโพสต์นี้" description="เฉพาะเจ้าของโพสต์ บุคลากรของคณะ หรือผู้ดูแลระบบเท่านั้น" />}
      >
        <PostForm post={data} />
      </Can>
    </div>
  );
}
