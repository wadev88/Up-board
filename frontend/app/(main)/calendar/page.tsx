import type { Metadata } from "next";
import { PageHeader } from "@/components/common/PageHeader";
import { CalendarView } from "@/features/events/components/CalendarView";

export const metadata: Metadata = { title: "ปฏิทินกิจกรรม" };

export default function CalendarPage() {
  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader title="ปฏิทินกิจกรรม" description="ดูกิจกรรมของมหาวิทยาลัย คณะ และชมรมตามวัน แตะวันที่เพื่อดูรายละเอียด" />
      <CalendarView />
    </div>
  );
}
