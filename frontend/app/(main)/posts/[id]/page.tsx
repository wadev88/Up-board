import type { Metadata } from "next";
import { PostDetailScreen } from "@/features/posts/components/PostDetailScreen";

export const metadata: Metadata = { title: "รายละเอียดโพสต์" };

export default function PostDetailPage() {
  return <PostDetailScreen />;
}
