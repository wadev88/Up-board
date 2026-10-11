"use client";

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Trash2 } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FormField } from "@/components/ui/form-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABELS, ROLE_ORDER } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { reportFormError } from "@/lib/forms";
import { FacultyProgramFields } from "@/features/auth/components/FacultyProgramFields";
import { ApiError } from "@/services/apiClient";
import { useAdminDeleteUser, useAdminUpdateUser, useAssignableFaculties } from "@/features/admin/hooks";
import { adminUserSchema, type AdminUserValues } from "@/features/admin/schemas";
import type { AdminUpdateUserBody, User } from "@/types/api";

const FIELDS = [
  "role",
  "faculty_id",
  "program_id",
  "is_active",
  "is_verified",
  "technician_specialty",
  "technician_zone",
] as const;

/** Message for a failed delete: 409 carries a specific Thai reason from the API (last admin,
 * technician with unfinished repairs, ...), everything else uses the generic translation. */
export function deleteErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 409 && e.message) return e.message;
    return e.userMessage;
  }
  return "ลบบัญชีไม่สำเร็จ กรุณาลองใหม่";
}

function DangerZone({ user, isSelf, onDeleted }: { user: User; isSelf: boolean; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const remove = useAdminDeleteUser();

  const confirm = async () => {
    try {
      await remove.mutateAsync(user.id);
      toast.success(`ลบบัญชีของ ${user.display_name} แล้ว`);
      setOpen(false);
      onDeleted();
    } catch (e) {
      toast.error(deleteErrorMessage(e));
      setOpen(false);
    }
  };

  return (
    <section
      aria-labelledby="admin-danger-title"
      className="mt-2 grid gap-3 rounded-xl border border-red-300 bg-red-50/60 p-4 dark:border-red-900 dark:bg-red-950/20"
    >
      <h3 id="admin-danger-title" className="text-sm font-semibold text-red-800 dark:text-red-300">
        โซนอันตราย
      </h3>
      <p className="text-xs text-muted-foreground">
        {isSelf
          ? "ไม่สามารถลบบัญชีของตัวเองได้"
          : "ลบบัญชีนี้ออกจากระบบ ผู้ใช้จะเข้าสู่ระบบไม่ได้ และโพสต์ทั้งหมดของบัญชีนี้จะถูกลบไปด้วย ผู้ใช้สมัครใหม่ด้วยอีเมลเดิมได้ แต่จะเป็นบัญชีใหม่ที่ไม่มีข้อมูลเก่า ไม่สามารถย้อนกลับได้"}
      </p>
      <Button
        type="button"
        variant="destructive"
        disabled={isSelf}
        onClick={() => setOpen(true)}
      >
        <Trash2 aria-hidden="true" />
        ลบบัญชี
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent role="alertdialog">
          <DialogHeader>
            <DialogTitle>ลบบัญชี {user.display_name}?</DialogTitle>
            <DialogDescription>
              บัญชีจะถูกลบออกและผู้ใช้จะเข้าสู่ระบบไม่ได้ โพสต์ทั้งหมดของบัญชีนี้จะถูกลบไปด้วย ผู้ใช้สามารถสมัครใหม่ด้วยอีเมลเดิมได้ในภายหลัง แต่จะเป็นบัญชีใหม่ที่ไม่มีข้อมูลเก่า การลบนี้ไม่สามารถย้อนกลับได้
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={remove.isPending}>
              ยกเลิก
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={remove.isPending}
              onClick={confirm}
            >
              ลบบัญชี
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function EditForm({ user, onDone }: { user: User; onDone: () => void }) {
  const { user: me } = useAuth();
  const isSelf = me?.id === user.id;
  const faculties = useAssignableFaculties(user.faculty?.id);
  const update = useAdminUpdateUser();
  const form = useForm<AdminUserValues>({
    resolver: zodResolver(adminUserSchema),
    defaultValues: {
      role: user.role,
      faculty_id: user.faculty?.id ?? 0,
      program_id: user.program?.id ?? 0,
      is_active: user.is_active,
      is_verified: user.is_verified,
      lift_suspension: false,
      technician_specialty: "",
      technician_zone: "",
    },
  });
  // the technician profile follows the role (ADR-003): only technicians have specialty / zone
  const role = useWatch({ control: form.control, name: "role" });
  const isTechnician = role === "technician";
  // the API reports null once a suspension has ended
  const suspension = user.suspension;
  const suspendedUntil = user.posting_suspended_until ?? suspension?.ends_at ?? null;
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (v) => {
    const body: AdminUpdateUserBody = {
      // "— ไม่สังกัดคณะ —" (0) clears the faculty: send an explicit null
      faculty_id: v.faculty_id > 0 ? v.faculty_id : null,
      program_id: v.faculty_id > 0 && v.program_id > 0 ? v.program_id : null,
      is_active: v.is_active,
      is_verified: v.is_verified,
    };
    if (!isSelf) body.role = v.role;
    if (v.lift_suspension) body.lift_suspension = true;
    if (isTechnician) {
      if (v.technician_specialty) body.technician_specialty = v.technician_specialty;
      if (v.technician_zone) body.technician_zone = v.technician_zone;
    }
    try {
      await update.mutateAsync({ id: user.id, body });
      toast.success(`บันทึกข้อมูลของ ${user.display_name} แล้ว`);
      onDone();
    } catch (e) {
      reportFormError(e, form.setError, FIELDS, {
        // backend: 422 VALIDATION_ERROR, details [{ field: "faculty_id" }] when a teacher has no faculty
        messages: { faculty_id: "อาจารย์ต้องสังกัดคณะ", program_id: "สาขาวิชาต้องอยู่ในคณะที่เลือก" },
      });
    }
  });

  // the faculty <select> must mount with its options, or the current faculty is lost and
  // saving would clear it
  if (!faculties.data) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        กำลังโหลด…
      </p>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5">
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <FormField
        id="admin-role"
        label="บทบาท"
        error={errors.role?.message}
        hint={
          isSelf
            ? "ไม่สามารถเปลี่ยนบทบาทของตัวเองได้"
            : "ผู้ใช้ 1 บัญชีมีได้ 1 บทบาท การเปลี่ยนบทบาทจะบันทึกในประวัติและบังคับให้เข้าสู่ระบบใหม่"
        }
      >
        <Select id="admin-role" disabled={isSelf} {...form.register("role")}>
          {ROLE_ORDER.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </FormField>
      <FacultyProgramFields
        form={form}
        faculties={faculties.data}
        idPrefix="admin"
        allowAdminOnly
        requiredFaculty={false}
        requiredProgram={false}
        currentProgram={user.program}
        noFacultyLabel="— ไม่สังกัดคณะ —"
        facultyHint="อาจารย์ต้องสังกัดคณะ"
      />
      <Controller
        control={form.control}
        name="is_active"
        render={({ field }) => (
          <div className="flex min-h-12 items-center justify-between gap-4">
            <Label htmlFor="admin-active">เปิดใช้งานบัญชี</Label>
            <Switch id="admin-active" checked={field.value} onCheckedChange={field.onChange} disabled={isSelf} />
          </div>
        )}
      />
      <Controller
        control={form.control}
        name="is_verified"
        render={({ field }) => (
          <div className="flex min-h-12 items-center justify-between gap-4">
            <Label htmlFor="admin-verified">
              ยืนยันอีเมลแล้ว
              <span className="block text-xs font-normal text-muted-foreground">
                ปกติผู้ใช้ยืนยันเองด้วยการเข้าสู่ระบบด้วย Google ครั้งแรก — เปิดไว้เมื่อต้องช่วยผู้ใช้ (การปิดจะบังคับให้เข้าสู่ระบบใหม่)
              </span>
            </Label>
            <Switch id="admin-verified" checked={field.value} onCheckedChange={field.onChange} />
          </div>
        )}
      />
      {suspendedUntil && (
        <Controller
          control={form.control}
          name="lift_suspension"
          render={({ field }) => (
            <div className="flex min-h-12 items-center justify-between gap-4 rounded-xl bg-secondary-soft p-3">
              <Label htmlFor="admin-lift">
                ยกเลิกการระงับโพสต์
                <span className="block text-xs font-normal text-muted-foreground">
                  {suspension ? `ระงับตั้งแต่ ${formatDateTime(suspension.starts_at)} · วันสุดท้าย ${formatDate(suspension.last_day)} · ` : "ระงับ · "}
                  คืนสิทธิ์ {formatDateTime(suspendedUntil)}
                </span>
              </Label>
              <Switch id="admin-lift" checked={field.value} onCheckedChange={field.onChange} />
            </div>
          )}
        />
      )}
      {isTechnician && (
        <div className="grid gap-4 rounded-xl border border-border p-4">
          <FormField id="admin-spec" label="ความเชี่ยวชาญ" error={errors.technician_specialty?.message} hint="เช่น ไฟฟ้า ประปา แอร์ (เว้นว่างเพื่อคงค่าเดิม)">
            <Input id="admin-spec" {...form.register("technician_specialty")} />
          </FormField>
          <FormField id="admin-zone" label="โซนรับผิดชอบ" error={errors.technician_zone?.message} hint="เช่น โซน A, หอพัก (เว้นว่างเพื่อคงค่าเดิม)">
            <Input id="admin-zone" {...form.register("technician_zone")} />
          </FormField>
        </div>
      )}
      <SheetFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          ยกเลิก
        </Button>
        <Button type="submit" loading={isSubmitting}>
          บันทึก
        </Button>
      </SheetFooter>
    </form>
    <DangerZone user={user} isSelf={isSelf} onDeleted={onDone} />
    </div>
  );
}

export function UserEditSheet({ user, onOpenChange }: { user: User | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={!!user} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>แก้ไขผู้ใช้</SheetTitle>
          <SheetDescription>{user ? `${user.display_name} · ${user.email}` : ""}</SheetDescription>
        </SheetHeader>
        {user && <EditForm key={user.id} user={user} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}
