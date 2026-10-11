"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { authApi } from "@/features/auth/api";
import { getErrorMessage, isApiError } from "@/services/apiClient";
import {
  discardSupabaseSession,
  exchangeCodeForSupabaseToken,
  takeNextPath,
} from "@/services/googleSignIn";
import { NotRegisteredDialog } from "@/features/auth/components/NotRegisteredDialog";
import { PasswordConfirmDialog } from "@/features/auth/components/PasswordConfirmDialog";
import { safeNextPath } from "@/lib/utils";

/**
 * /auth/callback — finishes Google sign-in: code → Supabase token → POST /auth/supabase.
 * The API rejects non-@up.ac.th, unverified or not-yet-registered (NOT_REGISTERED) Google
 * accounts; then no session is created. A self-registered account that is not verified yet must
 * also confirm its registration password (PASSWORD_CONFIRMATION_REQUIRED): the Supabase token is
 * kept in memory while the modal is open and the exchange is retried with the password.
 */
export function GoogleCallback() {
  const params = useSearchParams();
  const router = useRouter();
  const { signInWithTokens } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [notRegistered, setNotRegistered] = useState(false);
  const [needPassword, setNeedPassword] = useState(false);
  const started = useRef(false);
  const supabaseToken = useRef<string | null>(null); // in memory only, dropped after use
  const nextPath = useRef("/dashboard");

  const dropSupabaseSession = useCallback(() => {
    const token = supabaseToken.current;
    supabaseToken.current = null;
    if (token) void discardSupabaseSession(token);
  }, []);

  /** Dialog submit: retry the exchange with the same Supabase token. Returns an error text. */
  const confirmPassword = useCallback(
    async (password: string): Promise<string | null> => {
      const token = supabaseToken.current;
      if (!token) return "หมดเวลา กรุณาเข้าสู่ระบบด้วย Google ใหม่อีกครั้ง";
      try {
        const res = await authApi.exchangeSupabase(token, password);
        setNeedPassword(false);
        dropSupabaseSession();
        signInWithTokens(res);
        router.replace(nextPath.current);
        return null;
      } catch (e) {
        if (isApiError(e) && e.code === "PASSWORD_CONFIRMATION_REQUIRED") {
          return "รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่";
        }
        setNeedPassword(false);
        dropSupabaseSession();
        if (isApiError(e) && e.code === "NOT_REGISTERED") setNotRegistered(true);
        setError(getErrorMessage(e));
        return null;
      }
    },
    [dropSupabaseSession, router, signInWithTokens],
  );

  const cancelPassword = useCallback(() => {
    setNeedPassword(false);
    dropSupabaseSession();
    router.replace("/login");
  }, [dropSupabaseSession, router]);

  useEffect(() => {
    if (started.current) return; // the code is single-use (React dev double-effects)
    started.current = true;
    const code = params.get("code");
    const providerError = params.get("error_description") ?? params.get("error");
    const next = safeNextPath(takeNextPath());
    nextPath.current = next;

    (async () => {
      if (!code) {
        setError(
          providerError
            ? "เข้าสู่ระบบด้วย Google ไม่สำเร็จ หรือบัญชีนี้ไม่ได้รับอนุญาต (ใช้ได้เฉพาะ @up.ac.th)"
            : "ไม่พบรหัสยืนยันจาก Google กรุณาเริ่มเข้าสู่ระบบใหม่",
        );
        return;
      }
      try {
        supabaseToken.current = await exchangeCodeForSupabaseToken(code);
        const res = await authApi.exchangeSupabase(supabaseToken.current);
        dropSupabaseSession();
        signInWithTokens(res);
        router.replace(next);
      } catch (e) {
        if (supabaseToken.current && isApiError(e) && e.code === "PASSWORD_CONFIRMATION_REQUIRED") {
          setNeedPassword(true); // keep the token: the modal retries with the password
          return;
        }
        const hadToken = supabaseToken.current !== null;
        dropSupabaseSession();
        if (isApiError(e) && e.code === "NOT_REGISTERED") setNotRegistered(true);
        setError(hadToken ? getErrorMessage(e) : "ลิงก์เข้าสู่ระบบหมดอายุหรือถูกใช้ไปแล้ว กรุณาลองใหม่");
      }
    })();
  }, [params, router, signInWithTokens, dropSupabaseSession]);

  if (needPassword) {
    return <PasswordConfirmDialog open onSubmit={confirmPassword} onCancel={cancelPassword} />;
  }
  if (notRegistered) {
    return (
      <NotRegisteredDialog
        open
        onOpenChange={(open) => {
          if (!open) router.replace("/login");
        }}
      />
    );
  }
  if (error) {
    return (
      <div role="alert" className="grid gap-4 text-center">
        <AlertCircle className="mx-auto size-10 text-destructive" aria-hidden="true" />
        <p className="text-sm">{error}</p>
        <Button asChild>
          <Link href="/login">กลับไปหน้าเข้าสู่ระบบ</Link>
        </Button>
      </div>
    );
  }
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-6 text-sm text-muted-foreground">
      <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
      กำลังตรวจสอบบัญชี Google…
    </div>
  );
}
