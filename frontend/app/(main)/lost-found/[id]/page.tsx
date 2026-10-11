import type { Metadata } from "next";
import { LostFoundDetailScreen } from "@/features/lost-found/components/LostFoundDetailScreen";

export const metadata: Metadata = { title: "รายละเอียดของหาย/พบของ" };

export default function LostFoundDetailPage() {
  return <LostFoundDetailScreen />;
}
