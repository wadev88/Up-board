import type { Metadata } from "next";
import { ReportsTable } from "@/features/moderation/components/ReportsTable";

export const metadata: Metadata = { title: "รายงานเนื้อหา" };

export default function AdminReportsPage() {
  return <ReportsTable />;
}
