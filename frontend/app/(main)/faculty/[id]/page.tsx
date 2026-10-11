import type { Metadata } from "next";
import { FacultyFeed } from "@/features/posts/components/FacultyFeed";

export const metadata: Metadata = { title: "ฟีดคณะ" };

export default function FacultyFeedPage() {
  return <FacultyFeed />;
}
