import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { CreatePostScreen } from "@/features/posts/components/CreatePostScreen";

export const metadata: Metadata = { title: "สร้างโพสต์" };

export default function NewPostPage() {
  return (
    <div className="mx-auto max-w-[880px]">
      <PageHeader
        title="สร้างโพสต์"
        description="เลือกประเภทโพสต์ แบบฟอร์มจะเปลี่ยนตามประเภทที่เลือก"
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <CreatePostScreen />
      </Suspense>
    </div>
  );
}
