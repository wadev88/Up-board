"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Flag } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { Pagination } from "@/components/common/Pagination";
import { POST_TYPE_LABELS, REPORT_REASON_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { useMyReports } from "@/features/moderation/hooks";
import { ReportStatusBadge } from "@/features/moderation/components/ReportDrawer";

/** /reports — the reports the signed-in user has filed, with their current status. */
export function MyReports() {
  const [page, setPage] = useState(1);
  const q = useMyReports({ page, page_size: 20 });
  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader title="รายงานของฉัน" description="รายงานเนื้อหาที่คุณส่งถึงผู้ดูแลระบบ และผลการพิจารณา" />
      <div aria-live="polite" aria-busy={q.isFetching || undefined}>
        {q.isLoading ? (
          <div className="space-y-2" role="status" aria-label="กำลังโหลด">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data || q.data.items.length === 0 ? (
          <EmptyState icon={<Flag />} title="คุณยังไม่ได้ส่งรายงาน" description="พบโพสต์ไม่เหมาะสม? เลือก “รายงาน” จากเมนูของโพสต์" />
        ) : (
          <div className="space-y-4">
            <ul className="space-y-2">
              {q.data.items.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/reports/${r.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-card transition-shadow hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate font-medium">{r.post.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {POST_TYPE_LABELS[r.post.type]} · {REPORT_REASON_LABELS[r.reason]} · {formatDateTime(r.created_at)}
                      </p>
                      <ReportStatusBadge status={r.status} />
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
