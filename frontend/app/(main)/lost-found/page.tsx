import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/PageHeader";
import { LostFoundBrowser } from "@/features/lost-found/components/LostFoundBrowser";

export const metadata: Metadata = { title: "ของหาย/พบของ" };

export default function LostFoundPage() {
  return (
    <div className="mx-auto max-w-[960px]">
      <PageHeader
        title="ของหาย / พบของ"
        description="ช่วยกันตามหาเจ้าของ และส่งคืนของให้ถึงมือ"
        actions={
          <Button asChild>
            <Link href="/lost-found/new">
              <Plus aria-hidden="true" />
              ลงประกาศ
            </Link>
          </Button>
        }
      />
      <Suspense>
        <LostFoundBrowser />
      </Suspense>
    </div>
  );
}
