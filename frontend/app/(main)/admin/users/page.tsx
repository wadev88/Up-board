import type { Metadata } from "next";
import { UsersTable } from "@/features/admin/components/UsersTable";

export const metadata: Metadata = { title: "จัดการผู้ใช้" };

export default function AdminUsersPage() {
  return <UsersTable />;
}
