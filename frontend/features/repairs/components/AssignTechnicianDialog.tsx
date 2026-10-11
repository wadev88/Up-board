"use client";

import { useForm } from "react-hook-form";
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
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { FormField } from "@/components/ui/form-field";
import { ErrorState } from "@/components/common/ErrorState";
import { getErrorMessage } from "@/services/apiClient";
import { useAssignRepair, useTechnicians } from "@/features/repairs/hooks";
import { assignSchema, type AssignValues } from "@/features/repairs/schemas";
import type { Post } from "@/types/api";

interface AssignTechnicianDialogProps {
  post: Post;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssignTechnicianDialog({ post, open, onOpenChange }: AssignTechnicianDialogProps) {
  const technicians = useTechnicians(open);
  const assign = useAssignRepair(post.id);
  const form = useForm<AssignValues>({
    resolver: zodResolver(assignSchema),
    defaultValues: { technician_id: post.repair?.technician?.id ?? 0 },
  });
  const error = form.formState.errors.technician_id?.message;

  const onSubmit = form.handleSubmit(async ({ technician_id }) => {
    try {
      await assign.mutateAsync(technician_id);
      toast.success(
        post.repair?.is_assigned ? "เปลี่ยนช่างผู้รับผิดชอบแล้ว" : "มอบหมายช่างแล้ว สถานะเปลี่ยนเป็น “มอบหมายช่าง”",
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{post.repair?.is_assigned ? "เปลี่ยนช่างผู้รับผิดชอบ" : "มอบหมายช่าง"}</DialogTitle>
            <DialogDescription>
              {post.repair?.is_assigned
                ? "งานจะกลับเป็นสถานะ “มอบหมายช่าง” ให้ช่างคนใหม่เริ่มงาน ช่างคนเดิมจะได้รับแจ้งเตือน"
                : "เมื่อมอบหมายแล้ว สถานะจะเปลี่ยนเป็น “มอบหมายช่าง” และช่างจะได้รับแจ้งเตือน"}
            </DialogDescription>
          </DialogHeader>
          {technicians.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : technicians.isError ? (
            <ErrorState error={technicians.error} onRetry={() => technicians.refetch()} />
          ) : (
            <FormField id="assign-tech" label="ช่าง" required error={error}>
              <Select id="assign-tech" aria-invalid={!!error || undefined} {...form.register("technician_id", { valueAsNumber: true })}>
                <option value={0}>เลือกช่าง</option>
                {technicians.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.user.display_name}
                    {t.specialty ? ` · ${t.specialty}` : ""}
                    {t.zone ? ` · ${t.zone}` : ""}
                    {t.is_available ? "" : " (ไม่ว่าง)"}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" loading={assign.isPending} disabled={!technicians.data}>
              มอบหมาย
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
