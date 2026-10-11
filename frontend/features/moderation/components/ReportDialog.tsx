"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { FormField, fieldDescribedBy } from "@/components/ui/form-field";
import { REPORT_REASON_LABELS } from "@/lib/constants";
import { REPORT_TEXT_MAX } from "@/features/moderation/schemas";
import { reportFormError } from "@/lib/forms";
import { isApiError } from "@/services/apiClient";
import { useCreateReport } from "@/features/moderation/hooks";
import { createReportSchema, type CreateReportValues } from "@/features/moderation/schemas";
import type { ReportReason } from "@/types/api";

interface ReportDialogProps {
  postId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const REASONS = Object.keys(REPORT_REASON_LABELS) as ReportReason[];

export function ReportDialog({ postId, open, onOpenChange }: ReportDialogProps) {
  const mutation = useCreateReport();
  const form = useForm<CreateReportValues>({
    resolver: zodResolver(createReportSchema),
    defaultValues: { reason: "spam", detail: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync({
        post_id: postId,
        reason: values.reason,
        detail: values.detail ? values.detail : undefined,
      });
      toast.success("ส่งรายงานแล้ว ขอบคุณที่ช่วยดูแลชุมชน");
      form.reset();
      onOpenChange(false);
    } catch (e) {
      if (isApiError(e) && e.code === "DUPLICATE_REPORT") {
        toast.info("คุณได้รายงานโพสต์นี้ไปแล้ว");
        onOpenChange(false);
        return;
      }
      reportFormError(e, form.setError, ["reason", "detail"]);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>รายงานโพสต์</DialogTitle>
            <DialogDescription>ผู้ดูแลระบบจะตรวจสอบรายงานของคุณ ข้อมูลผู้รายงานจะไม่ถูกเปิดเผยต่อเจ้าของโพสต์</DialogDescription>
          </DialogHeader>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">เหตุผล</legend>
            <Controller
              control={form.control}
              name="reason"
              render={({ field }) => (
                <RadioGroup value={field.value} onValueChange={field.onChange} aria-label="เหตุผลในการรายงาน">
                  {REASONS.map((r) => (
                    <div key={r} className="flex min-h-12 items-center gap-3 md:min-h-9">
                      <RadioGroupItem value={r} id={`reason-${r}`} />
                      <Label htmlFor={`reason-${r}`} className="cursor-pointer font-normal">
                        {REPORT_REASON_LABELS[r]}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              )}
            />
          </fieldset>
          <FormField id="report-detail" label="รายละเอียดเพิ่มเติม" error={errors.detail?.message} hint="ไม่บังคับ (ยกเว้นเลือก “อื่น ๆ”)">
            <Textarea
              id="report-detail"
              rows={3}
              maxLength={REPORT_TEXT_MAX}
              aria-invalid={!!errors.detail || undefined}
              aria-describedby={fieldDescribedBy("report-detail", errors.detail?.message, true)}
              {...form.register("detail")}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" variant="destructive" loading={mutation.isPending}>
              ส่งรายงาน
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
