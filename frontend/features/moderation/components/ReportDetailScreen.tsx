"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadErrorState } from "@/components/common/LoadErrorState";
import { POST_TYPE_LABELS, REPORT_REASON_LABELS, REPORT_STATUS_LABELS, REPORT_STATUS_STYLES } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { parsePositiveId } from "@/lib/utils";
import { useReport } from "@/features/moderation/hooks";
import { ReportStatusBadge } from "@/features/moderation/components/ReportDrawer";
import { postHref } from "@/features/posts/utils";

const BACK = { backHref: "/reports", backLabel: "รายงานของฉัน" };

/** /reports/[id] — one report (its owner or an admin): status and every decision with its note. */
export function ReportDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const reportId = parsePositiveId(id);
  const q = useReport(reportId ?? 0);

  if (reportId === null) return <LoadErrorState notFound notFoundTitle="ไม่พบรายงานนี้" {...BACK} />;
  if (q.isLoading) {
    return (
      <div className="mx-auto max-w-[720px] space-y-4" role="status" aria-label="กำลังโหลด">
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <LoadErrorState
        error={q.error}
        notFoundTitle="ไม่พบรายงานนี้"
        errorTitle="โหลดรายงานไม่สำเร็จ"
        onRetry={() => q.refetch()}
        {...BACK}
      />
    );
  }
  const r = q.data;
  const removed = r.post.status === "removed";
  return (
    <div className="mx-auto max-w-[720px] space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-3">
        <Link href={BACK.backHref}>
          <ArrowLeft aria-hidden="true" />
          {BACK.backLabel}
        </Link>
      </Button>
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
          <CardTitle as="h2">รายงาน #{r.id}</CardTitle>
          <ReportStatusBadge status={r.status} />
        </CardHeader>
        <CardContent className="space-y-5">
          <section aria-labelledby="rd-post" className="space-y-1 rounded-xl border border-border p-4">
            <h3 id="rd-post" className="text-xs font-medium text-muted-foreground">โพสต์ที่รายงาน</h3>
            <p className="font-medium">{r.post.title}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{POST_TYPE_LABELS[r.post.type]}</Badge>
              {removed ? (
                <Badge variant="custom" className={REPORT_STATUS_STYLES.content_removed}>ถูกนำออกแล้ว</Badge>
              ) : (
                <Link href={postHref(r.post)} className="text-primary hover:underline">
                  เปิดโพสต์
                </Link>
              )}
            </div>
          </section>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">เหตุผล</dt>
              <dd className="font-medium">{REPORT_REASON_LABELS[r.reason]}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">ส่งเมื่อ</dt>
              <dd>{formatDateTime(r.created_at)}</dd>
            </div>
            {r.detail && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">รายละเอียดที่แจ้ง</dt>
                <dd className="whitespace-pre-wrap rounded-lg bg-muted px-3 py-2">{r.detail}</dd>
              </div>
            )}
          </dl>
          <section aria-labelledby="rd-history" className="space-y-3">
            <h3 id="rd-history" className="text-sm font-semibold">ผลการพิจารณา</h3>
            {r.actions.length === 0 ? (
              <p className="text-sm text-muted-foreground">รอผู้ดูแลระบบตรวจสอบ</p>
            ) : (
              <ol className="space-y-3 border-l border-border pl-4">
                {r.actions.map((a) => (
                  <li key={a.id} className="text-sm">
                    <p className="font-medium">{REPORT_STATUS_LABELS[a.to_status]}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.admin.display_name} · {formatDateTime(a.created_at)}
                    </p>
                    {a.note && <p className="mt-1 rounded-lg bg-muted px-3 py-2">{a.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
