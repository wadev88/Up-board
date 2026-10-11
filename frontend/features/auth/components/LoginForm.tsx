"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MailWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, fieldDescribedBy } from "@/components/ui/form-field";
import { useAuth } from "@/hooks/useAuth";
import { getErrorMessage, isApiError } from "@/services/apiClient";
import { safeNextPath } from "@/lib/utils";
import { loginSchema, type LoginValues } from "@/features/auth/schemas";
import { useAuthConfig } from "@/features/auth/hooks";
import { GoogleSignInButton } from "@/features/auth/components/GoogleSignInButton";
import { googleSignInConfigured } from "@/services/googleSignIn";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const { login, status } = useAuth();
  const config = useAuthConfig();
  const [serverError, setServerError] = useState<{ code: string; message: string } | null>(null);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (status === "authenticated") router.replace(next);
  }, [status, next, router]);

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await login(values);
      router.replace(next);
    } catch (e) {
      setServerError({ code: isApiError(e) ? e.code : "UNKNOWN", message: getErrorMessage(e) });
    }
  });

  return (
    <div className="grid gap-6">
      <form onSubmit={onSubmit} className="grid gap-5" noValidate>
        {serverError && (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
          >
            <p className="flex items-start gap-2">
              {serverError.code === "EMAIL_NOT_VERIFIED" && <MailWarning className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
              {serverError.message}
            </p>
            {serverError.code === "EMAIL_NOT_VERIFIED" &&
              (googleSignInConfigured() && config.data?.google_enabled ? (
                <GoogleSignInButton next={next} />
              ) : (
                <p className="text-xs">ยังไม่เปิดใช้การเข้าสู่ระบบด้วย Google กรุณาติดต่อผู้ดูแลระบบเพื่อยืนยันอีเมลให้</p>
              ))}
          </div>
        )}
  
        <FormField id="login-email" label="อีเมลมหาวิทยาลัย" error={errors.email?.message}>
          <Input
            id="login-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="รหัสนิสิต@up.ac.th"
            aria-invalid={!!errors.email || undefined}
            aria-describedby={fieldDescribedBy("login-email", errors.email?.message)}
            {...form.register("email")}
          />
        </FormField>
  
        <FormField id="login-password" label="รหัสผ่าน" error={errors.password?.message}>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password || undefined}
            aria-describedby={fieldDescribedBy("login-password", errors.password?.message)}
            {...form.register("password")}
          />
        </FormField>
  
        <Button type="submit" loading={isSubmitting} className="w-full">
          เข้าสู่ระบบ
        </Button>
  
        {googleSignInConfigured() && config.data?.google_enabled && (
          <>
            <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              หรือ
              <span className="h-px flex-1 bg-border" />
            </div>
            <GoogleSignInButton next={next} />
          </>
        )}

        {config.data?.password_signup_enabled ? (
          <div className="grid gap-1 text-center text-sm text-muted-foreground">
            <p>
              ยังไม่มีบัญชี?{" "}
              <Link href="/register" className="font-medium text-primary underline-offset-4 hover:underline">
                สมัครสมาชิก
              </Link>
            </p>
            <p className="text-xs">ผู้ใช้ใหม่ต้องสมัครสมาชิกก่อน แล้วยืนยันอีเมลโดยเข้าสู่ระบบด้วย Google (@up.ac.th) ครั้งแรก จากนั้นจึงเข้าสู่ระบบด้วยรหัสผ่านได้</p>
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            ขณะนี้ปิดรับสมัครสมาชิกด้วยตนเอง กรุณาติดต่อผู้ดูแลระบบ
          </p>
        )}
      </form>
    </div>
  );
}
