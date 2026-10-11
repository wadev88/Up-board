import type { Metadata } from "next";
import { StatsOverview } from "@/features/admin/components/StatsOverview";

export const metadata: Metadata = { title: "ผู้ดูแลระบบ" };

export default function AdminPage() {
  return <StatsOverview />;
}
