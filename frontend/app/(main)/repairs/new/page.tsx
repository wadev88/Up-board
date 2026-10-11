import type { Metadata } from "next";
import { PageHeader } from "@/components/common/PageHeader";
import { ChangeTypeButton } from "@/features/posts/components/ChangeTypeButton";
import { RepairForm } from "@/features/repairs/components/RepairForm";

export const metadata: Metadata = { title: "แจ้งซ่อมใหม่" };

export default function NewRepairPage() {
  return (
    <div className="mx-auto max-w-[720px]">
      <PageHeader title="แจ้งซ่อมใหม่" description="3 ขั้นตอน: รูปภาพ → ตำแหน่ง → รายละเอียด" />
      <p className="mb-4 text-sm text-muted-foreground">
        ประเภท: แจ้งซ่อม · <ChangeTypeButton />
      </p>
      <RepairForm />
    </div>
  );
}
