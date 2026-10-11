"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  POST_TYPE_LABELS,
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  REPORT_STATUS_STYLES,
  ROLE_LABELS,
} from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { nextReportStatuses } from "@/lib/permissions";
import { getErrorMessage } from "@/services/apiClient";
import { postHref } from "@/features/posts/utils";
import { useUpdateReport } from "@/features/moderation/hooks";
import { REPORT_TEXT_MAX } from "@/features/moderation/schemas";
import type { Report, ReportStatus } from "@/types/api";

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return (
    <Badge variant="custom" className={REPORT_STATUS_STYLES[status]}>
      {REPORT_STATUS_LABELS[status]}
    </Badge>
  );
}

function ReportBody({ report, onDone }: { report: Report; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const update = useUpdateReport();
  const next = nextReportStatuses(report.status);

  const act = async (status: ReportStatus) => {
    try {
      await update.mutateAsync({ id: report.id, body: { status, note: note.trim() || undefined } });
      toast.success(`เปลี่ยนสถานะรายงานเป็น “${REPORT_STATUS_LABELS[status]}” แล้ว`);
      onDone();
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
      <section aria-labelledby="report-post" className="space-y-2 rounded-xl border border-border p-4">
        <h3 id="report-post" className="text-xs font-medium text-muted-foreground">โพสต์ที่ถูกรายงาน</h3>
        <p className="font-medium">{report.post.title}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{POST_TYPE_LABELS[report.post.type]}</Badge>
          {report.post.status === "removed" && <Badge variant="custom" className={REPORT_STATUS_STYLES.content_removed}>ถูกนำออกแล้ว</Badge>}
          <Link href={postHref(report.post)} target="_blank" className="inline-flex min-h-11 items-center gap-1 text-primary hover:underline md:min-h-0">
            เปิดโพสต์
            <ExternalLink className="size-3" aria-hidden="true" />
            <span className="sr-only">(แท็บใหม่)</span>
          </Link>
        </div>
      </section>

      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">ผู้รายงาน</dt>
          <dd className="font-medium">
            {report.reporter.display_name}
            <span className="block text-xs font-normal text-muted-foreground">{ROLE_LABELS[report.reporter.role]}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">เหตุผล</dt>
          <dd className="font-medium">{REPORT_REASON_LABELS[report.reason]}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">สถานะ</dt>
          <dd>
            <ReportStatusBadge status={report.status} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">รายงานเมื่อ</dt>
          <dd>{formatDateTime(report.created_at)}</dd>
        </div>
        {report.detail && (
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">รายละเอียด</dt>
            <dd className="whitespace-pre-wrap rounded-lg bg-muted px-3 py-2">{report.detail}</dd>
          </div>
        )}
      </dl>

      <section aria-labelledby="report-history" className="space-y-3">
        <h3 id="report-history" className="text-sm font-semibold">ประวัติการดำเนินการ</h3>
        {report.actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">ยังไม่มีการดำเนินการ</p>
        ) : (
          <ol className="space-y-3 border-l border-border pl-4">
            {report.actions.map((a) => (
              <li key={a.id} className="text-sm">
                <p className="font-medium">
                  {REPORT_STATUS_LABELS[a.from_status]} → {REPORT_STATUS_LABELS[a.to_status]}
                </p>
                <p className="text-xs text-muted-foreground">
                  {a.admin.display_name} · {formatDateTime(a.created_at)}
                </p>
                {a.note && <p className="mt-1 rounded-lg bg-muted px-3 py-2">{a.note}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      {next.length > 0 ? (
        <section aria-labelledby="report-actions" className="mt-auto space-y-3 border-t border-border pt-4">
          <h3 id="report-actions" className="text-sm font-semibold">เลือกการดำเนินการ</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {next.includes("content_removed") && (
              <Button
                variant="destructive"
                onClick={() => setConfirmRemove(true)}
                loading={update.isPending && update.variables?.body.status === "content_removed"}
                disabled={update.isPending}
                data-testid="report-action-remove"
              >
                <Trash2 aria-hidden="true" />
                ลบเนื้อหา
              </Button>
            )}
            {next.includes("dismissed") && (
              <Button
                variant="outline"
                onClick={() => act("dismissed")}
                loading={update.isPending && update.variables?.body.status === "dismissed"}
                disabled={update.isPending}
                data-testid="report-action-dismiss"
              >
                <XCircle aria-hidden="true" />
                ปิดรายงาน (ไม่ลบเนื้อหา)
              </Button>
            )}
          </div>
          <FormField id="report-note" label="หมายเหตุถึงผู้รายงาน (ไม่บังคับ)" hint={`ไม่เกิน ${REPORT_TEXT_MAX.toLocaleString("en-US")} ตัวอักษร ใช้กับทั้งสองการดำเนินการ`}>
            <Input id="report-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={REPORT_TEXT_MAX} />
          </FormField>
          <ConfirmDialog
            open={confirmRemove}
            onOpenChange={setConfirmRemove}
            title="ลบเนื้อหานี้?"
            description="โพสต์จะถูกนำออกจากทุกหน้า รายงานอื่นที่เปิดอยู่ของโพสต์นี้จะถูกปิดด้วย และผู้รายงานจะได้รับแจ้ง"
            confirmLabel="ลบเนื้อหา"
            destructive
            loading={update.isPending}
            onConfirm={() => act("content_removed")}
          />
        </section>
      ) : (
        <p className="mt-auto text-sm text-muted-foreground">รายงานนี้ปิดแล้ว</p>
      )}
    </div>
  );
}

export function ReportDrawer({ report, onOpenChange }: { report: Report | null; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet open={!!report} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>รายงาน #{report?.id}</SheetTitle>
          <SheetDescription>ตรวจสอบและเลือกการดำเนินการที่อนุญาตตามสถานะปัจจุบัน</SheetDescription>
        </SheetHeader>
        {report && <ReportBody key={`${report.id}-${report.status}`} report={report} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}
