import type { Metadata } from "next";
import { CatalogManager } from "@/features/admin/components/CatalogManager";

export const metadata: Metadata = { title: "คณะและสาขาวิชา" };

export default function AdminCatalogPage() {
  return <CatalogManager />;
}
