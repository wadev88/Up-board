import type { Metadata } from "next";
import { EditPostScreen } from "@/features/posts/components/EditPostScreen";

export const metadata: Metadata = { title: "แก้ไขโพสต์" };

export default function EditPostPage() {
  return <EditPostScreen />;
}
