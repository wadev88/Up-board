"use client";

import Link from "next/link";
import { Flag, Newspaper, Users, Wrench, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { formatNumber } from "@/lib/format";
import { useAdminStats } from "@/features/admin/hooks";
import type { AdminStats } from "@/types/api";

const TILES: { key: keyof AdminStats; label: string; icon: LucideIcon; href?: string }[] = [
  { key: "users_total", label: "ผู้ใช้ทั้งหมด", icon: Users, href: "/admin/users" },
  { key: "posts_today", label: "โพสต์วันนี้", icon: Newspaper, href: "/posts" },
  { key: "open_reports", label: "รายงานที่ยังเปิดอยู่", icon: Flag, href: "/admin/reports" },
  { key: "pending_repairs", label: "งานซ่อมรอดำเนินการ", icon: Wrench, href: "/repairs?status=pending" },
];

export function StatsOverview() {
  const { data, isLoading, isError, error, refetch } = useAdminStats();
  return (
    <div>
      <PageHeader title="ภาพรวมระบบ" description="สถิติพื้นฐานของ UP Board" />
      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <ul className="grid grid-cols-2 gap-4 md:gap-5 lg:grid-cols-4">
          {TILES.map((t) => {
            const Icon = t.icon;
            const inner = (
              <>
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon className="size-4" aria-hidden="true" />
                  {t.label}
                </span>
                {isLoading || !data ? (
                  <Skeleton className="h-9 w-16" />
                ) : (
                  <span className="text-3xl font-semibold tabular-nums">{formatNumber(data[t.key])}</span>
                )}
              </>
            );
            return (
              <li key={t.key}>
                {t.href ? (
                  <Link
                    href={t.href}
                    className="flex h-full flex-col gap-3 rounded-xl border border-border p-5 transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="flex h-full flex-col gap-3 rounded-xl border border-border p-5">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
