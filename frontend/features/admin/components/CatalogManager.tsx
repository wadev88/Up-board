"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { GraduationCap, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { reportFormError } from "@/lib/forms";
import { getErrorMessage } from "@/services/apiClient";
import {
  useAdminFaculties,
  useCreateFaculty,
  useCreateProgram,
  useUpdateFaculty,
  useUpdateProgram,
} from "@/features/admin/hooks";
import {
  facultyCatalogSchema,
  programCatalogSchema,
  type FacultyCatalogValues,
  type ProgramCatalogValues,
} from "@/features/admin/schemas";
import type { Faculty, Program } from "@/types/api";

type Editing =
  | { kind: "faculty"; faculty: Faculty | null }
  | { kind: "program"; faculty: Faculty; program: Program | null }
  | null;

const emptyToNull = (v: string) => (v.trim() ? v.trim() : null);

function FacultyForm({ faculty, onDone }: { faculty: Faculty | null; onDone: () => void }) {
  const create = useCreateFaculty();
  const update = useUpdateFaculty();
  const form = useForm<FacultyCatalogValues>({
    resolver: zodResolver(facultyCatalogSchema),
    defaultValues: { code: faculty?.code ?? "", name_th: faculty?.name_th ?? "", name_en: faculty?.name_en ?? "" },
  });
  const { errors, isSubmitting } = form.formState;
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      if (faculty) {
        await update.mutateAsync({ id: faculty.id, body: { name_th: v.name_th, name_en: emptyToNull(v.name_en) } });
        toast.success("แก้ไขชื่อคณะแล้ว");
      } else {
        await create.mutateAsync({ code: v.code, name_th: v.name_th, name_en: emptyToNull(v.name_en) });
        toast.success("เพิ่มคณะแล้ว");
      }
      onDone();
    } catch (e) {
      reportFormError(e, form.setError, ["code", "name_th", "name_en"]);
    }
  });
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormField
        id="faculty-code"
        label="รหัสคณะ"
        required
        error={errors.code?.message}
        hint={faculty ? "รหัสแก้ไขไม่ได้ (ชื่อเปลี่ยนได้โดยไม่กระทบข้อมูลเดิม)" : undefined}
      >
        <Input id="faculty-code" disabled={!!faculty} {...form.register("code")} />
      </FormField>
      <FormField id="faculty-name-th" label="ชื่อคณะ (ไทย)" required error={errors.name_th?.message}>
        <Input id="faculty-name-th" {...form.register("name_th")} />
      </FormField>
      <FormField id="faculty-name-en" label="ชื่อคณะ (อังกฤษ)" error={errors.name_en?.message}>
        <Input id="faculty-name-en" {...form.register("name_en")} />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          ยกเลิก
        </Button>
        <Button type="submit" loading={isSubmitting}>
          บันทึก
        </Button>
      </DialogFooter>
    </form>
  );
}

function ProgramForm({ faculty, program, onDone }: { faculty: Faculty; program: Program | null; onDone: () => void }) {
  const create = useCreateProgram();
  const update = useUpdateProgram();
  const form = useForm<ProgramCatalogValues>({
    resolver: zodResolver(programCatalogSchema),
    defaultValues: {
      faculty_id: faculty.id,
      code: program?.code ?? "",
      name_th: program?.name_th ?? "",
      name_en: program?.name_en ?? "",
    },
  });
  const { errors, isSubmitting } = form.formState;
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      if (program) {
        await update.mutateAsync({ id: program.id, body: { name_th: v.name_th, name_en: emptyToNull(v.name_en) } });
        toast.success("แก้ไขชื่อสาขาวิชาแล้ว");
      } else {
        await create.mutateAsync({
          faculty_id: faculty.id,
          code: v.code,
          name_th: v.name_th,
          name_en: emptyToNull(v.name_en),
        });
        toast.success("เพิ่มสาขาวิชาแล้ว");
      }
      onDone();
    } catch (e) {
      reportFormError(e, form.setError, ["code", "name_th", "name_en", "faculty_id"]);
    }
  });
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormField
        id="program-code"
        label="รหัสสาขาวิชา"
        required
        error={errors.code?.message}
        hint={program ? "รหัสแก้ไขไม่ได้" : undefined}
      >
        <Input id="program-code" disabled={!!program} {...form.register("code")} />
      </FormField>
      <FormField id="program-name-th" label="ชื่อสาขาวิชา (ไทย)" required error={errors.name_th?.message}>
        <Input id="program-name-th" {...form.register("name_th")} />
      </FormField>
      <FormField id="program-name-en" label="ชื่อสาขาวิชา (อังกฤษ)" error={errors.name_en?.message}>
        <Input id="program-name-en" {...form.register("name_en")} />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          ยกเลิก
        </Button>
        <Button type="submit" loading={isSubmitting}>
          บันทึก
        </Button>
      </DialogFooter>
    </form>
  );
}

const inactiveBadge = <Badge variant="warning">ปิดใช้งาน</Badge>;
const adminOnlyBadge = <Badge variant="accent">เฉพาะผู้ดูแล</Badge>;

/**
 * Admin catalog: add / rename / deactivate faculties and programs. Nothing is ever deleted —
 * deactivated entries disappear from the sign-up lists but stay on existing users and posts.
 */
export function CatalogManager() {
  const q = useAdminFaculties();
  const updateFaculty = useUpdateFaculty();
  const updateProgram = useUpdateProgram();
  const [editing, setEditing] = useState<Editing>(null);
  const [toggle, setToggle] = useState<
    { kind: "faculty"; item: Faculty } | { kind: "program"; item: Program } | null
  >(null);

  const confirmToggle = async () => {
    if (!toggle) return;
    try {
      if (toggle.kind === "faculty") {
        await updateFaculty.mutateAsync({ id: toggle.item.id, body: { is_active: !toggle.item.is_active } });
      } else {
        await updateProgram.mutateAsync({ id: toggle.item.id, body: { is_active: !toggle.item.is_active } });
      }
      toast.success(toggle.item.is_active ? "ปิดใช้งานแล้ว" : "เปิดใช้งานอีกครั้งแล้ว");
      setToggle(null);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const title =
    editing?.kind === "faculty"
      ? editing.faculty
        ? "แก้ไขคณะ"
        : "เพิ่มคณะ"
      : editing?.kind === "program"
        ? editing.program
          ? `แก้ไขสาขาวิชา · ${editing.faculty.name_th}`
          : `เพิ่มสาขาวิชา · ${editing.faculty.name_th}`
        : "";

  return (
    <div>
      <PageHeader
        title="คณะและสาขาวิชา"
        description="เพิ่ม เปลี่ยนชื่อ หรือปิดใช้งานคณะ / สาขาวิชา — ไม่มีการลบ ผู้ใช้และโพสต์เดิมยังคงอ้างอิงข้อมูลเดิมได้"
        actions={
          <Button onClick={() => setEditing({ kind: "faculty", faculty: null })}>
            <Plus aria-hidden="true" />
            เพิ่มคณะ
          </Button>
        }
      />

      {q.isLoading ? (
        <div className="space-y-4" role="status" aria-label="กำลังโหลด">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data || q.data.length === 0 ? (
        <EmptyState icon={<GraduationCap />} title="ยังไม่มีคณะ" />
      ) : (
        <ul className="space-y-4">
          {q.data.map((f) => (
            <li key={f.id}>
              <Card className={f.is_active ? undefined : "opacity-80"}>
                <CardHeader className="flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <CardTitle as="h2" className="flex flex-wrap items-center gap-2">
                      {f.name_th}
                      {!f.is_active && inactiveBadge}
                      {f.admin_only && adminOnlyBadge}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {f.code}
                      {f.name_en ? ` · ${f.name_en}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditing({ kind: "faculty", faculty: f })}>
                      <Pencil aria-hidden="true" />
                      เปลี่ยนชื่อ
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setToggle({ kind: "faculty", item: f })}>
                      {f.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </Button>
                    <Button size="sm" onClick={() => setEditing({ kind: "program", faculty: f, program: null })}>
                      <Plus aria-hidden="true" />
                      เพิ่มสาขาวิชา
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {!f.programs || f.programs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">ยังไม่มีสาขาวิชา</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-xl border border-border">
                      {f.programs.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                              {p.name_th}
                              {!p.is_active && inactiveBadge}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {p.code}
                              {p.name_en ? ` · ${p.name_en}` : ""}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditing({ kind: "program", faculty: f, program: p })}
                              aria-label={`เปลี่ยนชื่อ ${p.name_th}`}
                            >
                              <Pencil aria-hidden="true" />
                              เปลี่ยนชื่อ
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setToggle({ kind: "program", item: p })}
                              aria-label={`${p.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"} ${p.name_th}`}
                            >
                              {p.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>ใช้ภาษาไทยเป็นชื่อหลัก ชื่อภาษาอังกฤษเว้นว่างได้</DialogDescription>
          </DialogHeader>
          {editing?.kind === "faculty" && <FacultyForm faculty={editing.faculty} onDone={() => setEditing(null)} />}
          {editing?.kind === "program" && (
            <ProgramForm faculty={editing.faculty} program={editing.program} onDone={() => setEditing(null)} />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!toggle}
        onOpenChange={(o) => !o && setToggle(null)}
        title={toggle?.item.is_active ? "ปิดใช้งานรายการนี้?" : "เปิดใช้งานรายการนี้อีกครั้ง?"}
        description={
          toggle?.item.is_active
            ? `“${toggle.item.name_th}” จะไม่แสดงในรายการให้เลือกอีก แต่ผู้ใช้และโพสต์เดิมยังคงสังกัดตามเดิม`
            : toggle
              ? `“${toggle.item.name_th}” จะกลับมาให้เลือกได้`
              : undefined
        }
        confirmLabel={toggle?.item.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
        destructive={toggle?.item.is_active}
        loading={updateFaculty.isPending || updateProgram.isPending}
        onConfirm={confirmToggle}
      />
    </div>
  );
}
