import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/PageHeader";
import { PostListSkeleton } from "@/features/posts/components/PostCard";
import { RepairsBrowser } from "@/features/repairs/components/RepairsBrowser";

export const metadata: Metadata = { title: "แจ้งซ่อม" };

export default function RepairsPage() {
  return (
    <div>
      <PageHeader
        title="แจ้งซ่อม"
        description="งานแจ้งซ่อมเปิดให้ทุกคนเห็น เพื่อช่วยกันหลีกเลี่ยงจุดชำรุดในมหาวิทยาลัย"
        actions={
          <Button asChild>
            <Link href="/repairs/new">
              <Plus aria-hidden="true" />
              แจ้งซ่อม
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<PostListSkeleton count={4} />}>
        <RepairsBrowser />
      </Suspense>
    </div>
  );
}
