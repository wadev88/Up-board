import type { Metadata } from "next";
import { PublicProfile } from "@/features/auth/components/PublicProfile";

export const metadata: Metadata = { title: "โปรไฟล์ผู้ใช้" };

export default function UserProfilePage() {
  return <PublicProfile />;
}
