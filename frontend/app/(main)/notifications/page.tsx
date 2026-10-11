import type { Metadata } from "next";
import { NotificationsView } from "@/features/notifications/components/NotificationsView";

export const metadata: Metadata = { title: "การแจ้งเตือน" };

export default function NotificationsPage() {
  return <NotificationsView />;
}
