"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ROLE_LABELS, ROLE_ORDER } from "@/lib/constants";
import { reportFormError } from "@/lib/forms";
import { FacultyProgramFields } from "@/features/auth/components/FacultyProgramFields";
import { useAdminCreateUser, useAssignableFaculties } from "@/features/admin/hooks";
import { adminCreateUserSchema, type AdminCreateUserValues } from "@/features/admin/schemas";
import type { AdminCreateUserBody } from "@/types/api";

const FIELDS = [
  "email",
  "display_name",
  "role",
  "faculty_id",
  "program_id",
  "technician_specialty",
  "technician_zone",
] as const;

function CreateForm({ onDone }: { onDone: () => void }) {
  const faculties = useAssignableFaculties();
  const create = useAdminCreateUser();
  const form = useForm<AdminCreateUserValues>({
    resolver: zodResolver(adminCreateUserSchema),
    defaultValues: {
      email: "",
      display_name: "",
      role: "building_staff",
      faculty_id: 0,
      program_id: 0,
      technician_specialty: "",
      technician_zone: "",
    },
  });
  const role = useWatch({ control: form.control, name: "role" });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (v) => {
    const body: AdminCreateUserBody = {
      email: v.email,
      display_name: v.display_name,
      role: v.role,
      faculty_id: v.faculty_id > 0 ? v.faculty_id : null,
    };
    if (v.faculty_id > 0 && v.program_id > 0) body.program_id = v.program_id;
    if (v.role === "technician") {
      if (v.technician_specialty) body.technician_specialty = v.technician_specialty;
      if (v.technician_zone) body.technician_zone = v.technician_zone;
    }
    try {
      const user = await create.mutateAsync(body);
      toast.success(`สร้างบัญชี ${user.email} แล้ว — ให้เจ้าของบัญชีเข้าสู่ระบบด้วย Google`);
      onDone();
    } catch (e) {
      reportFormError(e, form.setError, FIELDS, {
        messages: { faculty_id: "อาจารย์ต้องสังกัดคณะ", program_id: "สาขาวิชาต้องอยู่ในคณะที่เลือก" },
      });
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-5" noValidate>
      <FormField
        id="create-email"
        label="อีเมล"
        required
        error={errors.email?.message}
        hint={
          role === "student_club"
            ? "บัญชีชมรม / สโมสร ใช้อีเมลใดก็ได้ (เช่น @gmail.com) เจ้าของเข้าสู่ระบบด้วย Google โดยใช้อีเมลนี้"
            : "ต้องเป็น @up.ac.th บัญชีนี้ไม่มีรหัสผ่าน เจ้าของเข้าสู่ระบบด้วย Google โดยใช้อีเมลนี้"
        }
      >
        <Input id="create-email" type="email" autoComplete="off" {...form.register("email")} />
      </FormField>
      <FormField id="create-name" label="ชื่อที่แสดง" required error={errors.display_name?.message}>
        <Input id="create-name" placeholder="เช่น กองอาคารสถานที่, สโมสรนิสิต ICT" {...form.register("display_name")} />
      </FormField>
      <FormField id="create-role" label="บทบาท" required error={errors.role?.message}>
        <Select id="create-role" {...form.register("role")}>
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
        idPrefix="create"
        allowAdminOnly
        requiredFaculty={false}
        requiredProgram={false}
        noFacultyLabel="— ไม่สังกัดคณะ —"
        facultyHint="อาจารย์ต้องสังกัดคณะ"
      />
      {role === "technician" && (
        <div className="grid gap-4 rounded-xl border border-border p-4">
          <FormField id="create-spec" label="ความเชี่ยวชาญ" error={errors.technician_specialty?.message} hint="เช่น ไฟฟ้า ประปา แอร์">
            <Input id="create-spec" {...form.register("technician_specialty")} />
          </FormField>
          <FormField id="create-zone" label="โซนรับผิดชอบ" error={errors.technician_zone?.message} hint="เช่น โซน A, หอพัก">
            <Input id="create-zone" {...form.register("technician_zone")} />
          </FormField>
        </div>
      )}
      <SheetFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          ยกเลิก
        </Button>
        <Button type="submit" loading={isSubmitting}>
          สร้างบัญชี
        </Button>
      </SheetFooter>
    </form>
  );
}

/** Admin pre-registers dedicated accounts; nobody can pick these roles at sign-up. */
export function UserCreateSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>สร้างบัญชี</SheetTitle>
          <SheetDescription>
            สำหรับเจ้าหน้าที่กองอาคารสถานที่ ช่าง สโมสร / ชมรม / องค์การ / สภา และผู้ดูแลระบบ — นิสิตและอาจารย์ลงชื่อเข้าใช้เองได้ผ่าน Google @up.ac.th
          </SheetDescription>
        </SheetHeader>
        {open && <CreateForm onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}
