import type { Metadata } from "next";
import { ReportDetailScreen } from "@/features/moderation/components/ReportDetailScreen";

export const metadata: Metadata = { title: "รายงาน" };

export default function ReportDetailPage() {
  return <ReportDetailScreen />;
}
