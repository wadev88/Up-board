"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, fieldDescribedBy } from "@/components/ui/form-field";
import { getErrorMessage, isApiError } from "@/services/apiClient";
import { applyServerFieldErrors } from "@/lib/forms";
import { registerSchema, type RegisterValues } from "@/features/auth/schemas";
import { useAuthConfig, useFaculties, useRegister } from "@/features/auth/hooks";
import { GoogleSignInButton } from "@/features/auth/components/GoogleSignInButton";
import { googleSignInConfigured } from "@/services/googleSignIn";
import { FacultyProgramFields } from "@/features/auth/components/FacultyProgramFields";

const FIELDS = ["email", "display_name", "password", "confirm_password", "faculty_id", "program_id"] as const;

export function RegisterForm() {
  const faculties = useFaculties();
  const register = useRegister();
  const config = useAuthConfig();
  const [done, setDone] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", display_name: "", password: "", confirm_password: "", faculty_id: 0, program_id: 0 },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (v) => {
    setServerError(null);
    try {
      await register.mutateAsync({
        email: v.email,
        password: v.password,
        display_name: v.display_name,
        faculty_id: v.faculty_id,
        program_id: v.program_id,
      });
      setDone(v.email);
    } catch (e) {
      if (isApiError(e) && e.code === "EMAIL_TAKEN") {
        form.setError("email", { message: "อีเมลนี้ถูกใช้สมัครแล้ว" }, { shouldFocus: true });
        return;
      }
      if (!applyServerFieldErrors(e, form.setError, FIELDS)) setServerError(getErrorMessage(e));
    }
  });

  if (done) {
    return (
      <div className="grid gap-4 text-center" role="status">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CheckCircle2 className="size-6" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold">สมัครสมาชิกสำเร็จ</h2>
        <p className="text-sm text-muted-foreground">
          ขั้นตอนสุดท้าย: ยืนยันอีเมลโดยเข้าสู่ระบบด้วย Google (@up.ac.th) ครั้งแรก (ใช้บัญชี Google
          ของมหาวิทยาลัยเดียวกับอีเมลที่สมัคร <span className="font-medium text-foreground">{done}</span>)
        </p>
        {googleSignInConfigured() && config.data?.google_enabled ? (
          <GoogleSignInButton next="/dashboard" prominent />
        ) : (
          <p className="rounded-lg border border-border bg-muted p-3 text-sm">
            ขณะนี้ยังไม่เปิดใช้การเข้าสู่ระบบด้วย Google กรุณาติดต่อผู้ดูแลระบบเพื่อยืนยันอีเมลให้
          </p>
        )}
        <Button asChild variant="outline">
          <Link href="/login">ไปหน้าเข้าสู่ระบบ</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      {serverError && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {serverError}
        </p>
      )}
      <FormField id="reg-email" label="อีเมลมหาวิทยาลัย" required error={errors.email?.message} hint="ต้องลงท้ายด้วย @up.ac.th">
        <Input
          id="reg-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          aria-invalid={!!errors.email || undefined}
          aria-describedby={fieldDescribedBy("reg-email", errors.email?.message, true)}
          {...form.register("email")}
        />
      </FormField>
      <FormField id="reg-name" label="ชื่อที่แสดง" required error={errors.display_name?.message}>
        <Input
          id="reg-name"
          autoComplete="nickname"
          aria-invalid={!!errors.display_name || undefined}
          aria-describedby={fieldDescribedBy("reg-name", errors.display_name?.message)}
          {...form.register("display_name")}
        />
      </FormField>
      <FacultyProgramFields form={form} faculties={faculties.data} idPrefix="reg" />
      {faculties.isError && (
        <Button type="button" variant="link" onClick={() => faculties.refetch()} className="justify-self-start">
          ลองโหลดรายชื่อคณะอีกครั้ง
        </Button>
      )}
      <FormField id="reg-password" label="รหัสผ่าน" required error={errors.password?.message} hint="อย่างน้อย 8 ตัวอักษร">
        <Input
          id="reg-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password || undefined}
          aria-describedby={fieldDescribedBy("reg-password", errors.password?.message, true)}
          {...form.register("password")}
        />
      </FormField>
      <FormField id="reg-confirm" label="ยืนยันรหัสผ่าน" required error={errors.confirm_password?.message}>
        <Input
          id="reg-confirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.confirm_password || undefined}
          aria-describedby={fieldDescribedBy("reg-confirm", errors.confirm_password?.message)}
          {...form.register("confirm_password")}
        />
      </FormField>
      <Button type="submit" loading={isSubmitting} className="w-full">
        สมัครสมาชิก
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        มีบัญชีแล้ว?{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          เข้าสู่ระบบ
        </Link>
      </p>
    </form>
  );
}
