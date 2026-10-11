"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { Pagination } from "@/components/common/Pagination";
import { DEFAULT_PAGE_SIZE, REPORT_REASON_LABELS, REPORT_STATUS_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { useReports } from "@/features/moderation/hooks";
import { ReportDrawer, ReportStatusBadge } from "@/features/moderation/components/ReportDrawer";
import type { Report, ReportStatus } from "@/types/api";

const STATUSES = Object.keys(REPORT_STATUS_LABELS) as ReportStatus[];

export function ReportsTable() {
  const [status, setStatus] = useState<ReportStatus | "">("reported");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const query = useReports({ status: status || undefined, page, page_size: DEFAULT_PAGE_SIZE });
  // keep drawer in sync with refreshed list data
  const selected: Report | null = query.data?.items.find((r) => r.id === selectedId) ?? null;

  return (
    <div>
      <PageHeader title="รายงานเนื้อหา" description="ตรวจสอบโพสต์ที่ถูกรายงานโดยผู้ใช้" />
      <FormField id="reports-status" label="สถานะ" className="mb-4 max-w-xs">
        <Select
          id="reports-status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as ReportStatus | "");
            setPage(1);
          }}
        >
          <option value="">ทั้งหมด</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {REPORT_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </FormField>

      <div aria-live="polite" aria-busy={query.isFetching || undefined}>
        {query.isLoading ? (
          <div className="space-y-2" role="status" aria-label="กำลังโหลด">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : !query.data || query.data.items.length === 0 ? (
          <EmptyState icon={<Flag />} title="ไม่มีรายงานในสถานะนี้" />
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <caption className="sr-only">รายการรายงานเนื้อหา</caption>
                <thead className="border-b border-border bg-subtle text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">โพสต์</th>
                    <th scope="col" className="px-4 py-3 font-medium">เหตุผล</th>
                    <th scope="col" className="px-4 py-3 font-medium">ผู้รายงาน</th>
                    <th scope="col" className="px-4 py-3 font-medium">สถานะ</th>
                    <th scope="col" className="px-4 py-3 font-medium">เมื่อ</th>
                    <th scope="col" className="px-4 py-3"><span className="sr-only">การจัดการ</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {query.data.items.map((r) => (
                    <tr key={r.id} className="hover:bg-subtle">
                      <td className="max-w-[240px] truncate px-4 py-3 font-medium">{r.post.title}</td>
                      <td className="px-4 py-3">{REPORT_REASON_LABELS[r.reason]}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.reporter.display_name}</td>
                      <td className="px-4 py-3">
                        <ReportStatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDateTime(r.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="outline" size="sm" onClick={() => setSelectedId(r.id)} aria-label={`ตรวจสอบรายงาน #${r.id}`}>
                          ตรวจสอบ
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={query.data.page} pageSize={query.data.page_size} total={query.data.total} onPageChange={setPage} />
          </div>
        )}
      </div>
      <ReportDrawer report={selected} onOpenChange={(o) => !o && setSelectedId(null)} />
    </div>
  );
}
