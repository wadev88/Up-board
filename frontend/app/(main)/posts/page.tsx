import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { PostListSkeleton } from "@/features/posts/components/PostCard";
import { PostsBrowser } from "@/features/posts/components/PostsBrowser";

export const metadata: Metadata = { title: "ชุมชน" };

export default function PostsPage() {
  return (
    <div>
      <PageHeader
        title="ชุมชน"
        description="โพสต์ ประกาศ และกิจกรรมที่ยังแสดงอยู่ของชุมชนมหาวิทยาลัยพะเยา"
      />
      <Suspense fallback={<PostListSkeleton count={4} />}>
        <PostsBrowser />
      </Suspense>
    </div>
  );
}
