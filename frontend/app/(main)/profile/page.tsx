import type { Metadata } from "next";
import { ProfileView } from "@/features/auth/components/ProfileView";

export const metadata: Metadata = { title: "โปรไฟล์" };

export default function ProfilePage() {
  return <ProfileView />;
}
