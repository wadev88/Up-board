import type { Metadata } from "next";
import { RepairDetailScreen } from "@/features/repairs/components/RepairDetailScreen";

export const metadata: Metadata = { title: "รายละเอียดงานแจ้งซ่อม" };

export default function RepairDetailPage() {
  return <RepairDetailScreen />;
}
