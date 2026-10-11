"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Hammer, RefreshCw, Send, Undo2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ImageUploader } from "@/components/common/ImageUploader";
import { useAuth } from "@/hooks/useAuth";
import { repairActions, type RepairAction } from "@/lib/permissions";
import { REPAIR_STATUS_LABELS } from "@/lib/constants";
import { queryKeys } from "@/lib/queryKeys";
import { getErrorMessage, isApiError } from "@/services/apiClient";
import { useUpdateRepairStatus } from "@/features/repairs/hooks";
import { REASON_MIN_LENGTH } from "@/features/repairs/schemas";
import type { Post, RepairStatus } from "@/types/api";

type StatusAction = Exclude<RepairAction, "assign">;

const TARGET: Record<StatusAction, RepairStatus> = {
  start: "in_progress",
  submit_review: "pending_review",
  close: "closed",
  send_back: "in_progress",
  reject: "rejected",
};

/** Actions the signed-in user may take on a repair, by role and status (the API re-checks). */
export function useRepairActions(post: Post): RepairAction[] {
  const { user } = useAuth();
  const repair = post.repair;
  if (!repair) return [];
  const assignedToMe =
    user?.role === "technician" && (post.permissions.can_update_status || repair.technician?.id === user.id);
  return repairActions(repair.status, user?.role, assignedToMe);
}

/** Dialog that requires a written reason before it can be confirmed (reject / send back). */
function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  loading: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const valid = trimmed.length >= REASON_MIN_LENGTH;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setReason("");
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <FormField id="repair-reason" label="เหตุผล" required hint={`อย่างน้อย ${REASON_MIN_LENGTH} ตัวอักษร`}>
          <Textarea
            id="repair-reason"
            rows={4}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        </FormField>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            ยกเลิก
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={!valid}
            loading={loading}
            onClick={() => onConfirm(trimmed)}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Role-specific workflow buttons (technician: start / send for review; building staff: close, send back, reject). */
export function RepairActions({ post }: { post: Post }) {
  const actions = useRepairActions(post).filter((a): a is StatusAction => a !== "assign");
  const current = post.repair!.status;
  const qc = useQueryClient();
  const mutation = useUpdateRepairStatus(post.id);
  const [note, setNote] = useState("");
  const [afterIds, setAfterIds] = useState<number[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploaderKey, setUploaderKey] = useState(0);
  const [dialog, setDialog] = useState<"close" | "send_back" | "reject" | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  if (actions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {current === "closed"
          ? "งานนี้ปิดแล้ว ไม่มีสถานะถัดไป"
          : current === "rejected"
            ? "คำร้องนี้ถูกปฏิเสธแล้ว ไม่มีสถานะถัดไป"
            : current === "open"
              ? "รอเจ้าหน้าที่กองอาคารมอบหมายช่าง"
              : current === "pending_review"
                ? "รอเจ้าหน้าที่กองอาคารตรวจสอบและปิดงาน"
                : "ไม่มีการดำเนินการที่คุณทำได้ในสถานะนี้"}
      </p>
    );
  }

  const run = async (action: StatusAction, text?: string) => {
    setConflict(null);
    const to = TARGET[action];
    try {
      const updated = await mutation.mutateAsync({
        status: to,
        note: text ? text : undefined,
        attachment_ids: action === "submit_review" && afterIds.length ? afterIds : undefined,
      });
      toast.success(`อัปเดตสถานะเป็น “${REPAIR_STATUS_LABELS[updated.repair?.status ?? to]}” แล้ว`);
      setDialog(null);
      setNote("");
      setAfterIds([]);
      setUploaderKey((k) => k + 1);
    } catch (e) {
      setDialog(null);
      if (isApiError(e) && (e.code === "INVALID_TRANSITION" || e.status === 409)) {
        setConflict(
          `ไม่สามารถเปลี่ยนจาก “${REPAIR_STATUS_LABELS[current]}” เป็น “${REPAIR_STATUS_LABELS[to]}” ได้ ` +
            "(อาจมีผู้อื่นอัปเดตไปก่อน กรุณารีเฟรชข้อมูล)",
        );
        return;
      }
      toast.error(getErrorMessage(e));
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await qc.refetchQueries({ queryKey: queryKeys.posts.detail(post.id), exact: true });
      setConflict(null);
    } finally {
      setRefreshing(false);
    }
  };

  const hasStart = actions.includes("start");
  const hasSubmit = actions.includes("submit_review");
  const staffActions = actions.filter((a) => a === "close" || a === "send_back" || a === "reject");

  return (
    <div className="grid gap-5">
      {conflict && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p>{conflict}</p>
          <Button type="button" size="sm" variant="outline" className="self-start" loading={refreshing} onClick={refresh}>
            <RefreshCw aria-hidden="true" />
            รีเฟรช
          </Button>
        </div>
      )}

      {(hasStart || hasSubmit) && (
        <div className="grid gap-4">
          <FormField id="repair-note" label="บันทึกถึงกองอาคาร (ไม่บังคับ)" hint="บันทึกนี้เห็นเฉพาะผู้แจ้ง เจ้าหน้าที่ และช่าง">
            <Textarea id="repair-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
          {hasSubmit && (
            <ImageUploader
              key={uploaderKey}
              label="รูปหลังซ่อม (ไม่บังคับ)"
              onChange={setAfterIds}
              onUploadingChange={setUploading}
            />
          )}
          <div className="flex flex-wrap gap-2">
            {hasStart && (
              <Button type="button" loading={mutation.isPending} onClick={() => run("start", note.trim())}>
                <Hammer aria-hidden="true" />
                เริ่มดำเนินการ
              </Button>
            )}
            {hasSubmit && (
              <Button type="button" disabled={uploading} loading={mutation.isPending} onClick={() => run("submit_review", note.trim())}>
                <Send aria-hidden="true" />
                ส่งให้กองอาคารตรวจสอบ
              </Button>
            )}
          </div>
        </div>
      )}

      {staffActions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {staffActions.includes("close") && (
            <Button type="button" onClick={() => setDialog("close")}>
              <CheckCircle2 aria-hidden="true" />
              ปิดงาน
            </Button>
          )}
          {staffActions.includes("send_back") && (
            <Button type="button" variant="outline" onClick={() => setDialog("send_back")}>
              <Undo2 aria-hidden="true" />
              ส่งกลับให้ช่างแก้ไข
            </Button>
          )}
          {staffActions.includes("reject") && (
            <Button type="button" variant="destructive" onClick={() => setDialog("reject")}>
              <XCircle aria-hidden="true" />
              ปฏิเสธคำร้อง
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={dialog === "close"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="ปิดงานซ่อมนี้?"
        description="งานจะย้ายออกจากรายการที่ยังไม่เสร็จ และผู้แจ้งจะได้รับแจ้งเตือน (ยังดูได้ในประวัติ)"
        confirmLabel="ปิดงาน"
        loading={mutation.isPending}
        onConfirm={() => run("close")}
      />
      <ReasonDialog
        open={dialog === "send_back"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="ส่งกลับให้ช่างแก้ไข"
        description="งานจะกลับเป็น “กำลังดำเนินการ” โปรดระบุสิ่งที่ต้องแก้ไข"
        confirmLabel="ส่งกลับ"
        loading={mutation.isPending}
        onConfirm={(reason) => run("send_back", reason)}
      />
      <ReasonDialog
        open={dialog === "reject"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="ปฏิเสธคำร้อง"
        description="เหตุผลจะแสดงในประวัติและส่งถึงผู้แจ้ง การปฏิเสธไม่สามารถย้อนกลับได้"
        confirmLabel="ยืนยันปฏิเสธ"
        destructive
        loading={mutation.isPending}
        onConfirm={(reason) => run("reject", reason)}
      />
    </div>
  );
}
