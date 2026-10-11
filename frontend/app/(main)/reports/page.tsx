import type { Metadata } from "next";
import { MyReports } from "@/features/moderation/components/MyReports";

export const metadata: Metadata = { title: "รายงานของฉัน" };

export default function ReportsPage() {
  return <MyReports />;
}
