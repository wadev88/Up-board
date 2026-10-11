import type { Metadata } from "next";
import { PageHeader } from "@/components/common/PageHeader";
import { ChangeTypeButton } from "@/features/posts/components/ChangeTypeButton";
import { LostFoundForm } from "@/features/lost-found/components/LostFoundForm";

export const metadata: Metadata = { title: "ลงประกาศของหาย/พบของ" };

export default function NewLostFoundPage() {
  return (
    <div className="mx-auto max-w-[720px]">
      <PageHeader title="ลงประกาศของหาย / พบของ" />
      <p className="mb-4 text-sm text-muted-foreground">
        ประเภท: ของหาย · <ChangeTypeButton />
      </p>
      <LostFoundForm />
    </div>
  );
}
