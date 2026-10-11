"use client";

import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthConfig } from "@/features/auth/hooks";
import { GoogleSignInButton } from "@/features/auth/components/GoogleSignInButton";
import { RegisterForm } from "@/features/auth/components/RegisterForm";
import { googleSignInConfigured } from "@/services/googleSignIn";

/**
 * Registration is mandatory before the first sign-in (password or Google). The sign-up form
 * appears unless the API switched it off (PASSWORD_SIGNUP_ENABLED=false).
 */
export function RegisterGate() {
  const config = useAuthConfig();
  if (config.isLoading) return <Skeleton className="h-40 w-full" />;
  if (config.data?.password_signup_enabled) {
    return (
      <div className="grid gap-6">
        <RegisterForm />
        {googleSignInConfigured() && config.data.google_enabled && (
          <>
            <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              หรือ
              <span className="h-px flex-1 bg-border" />
            </div>
            <GoogleSignInButton next="/dashboard" />
          </>
        )}
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      <p className="text-sm">
        ขณะนี้ปิดรับสมัครสมาชิกด้วยตนเอง กรุณาติดต่อผู้ดูแลระบบ
      </p>
      <Link href="/login" className="text-center text-sm font-medium text-primary underline-offset-4 hover:underline">
        กลับไปหน้าเข้าสู่ระบบ
      </Link>
    </div>
  );
}
