"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { googleSignInConfigured, startGoogleSignIn } from "@/services/googleSignIn";
import { useAuthConfig } from "@/features/auth/hooks";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8l4-3z" />
      <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
    </svg>
  );
}

/** "Sign in with Google (@up.ac.th)". Hidden when Google sign-in is not configured. */
export function GoogleSignInButton({ next, prominent = false }: { next: string; prominent?: boolean }) {
  const config = useAuthConfig();
  const [starting, setStarting] = useState(false);
  if (!googleSignInConfigured() || !config.data?.google_enabled) return null;

  const start = async () => {
    setStarting(true);
    try {
      await startGoogleSignIn(next);
    } catch {
      setStarting(false);
      toast.error("เริ่มเข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่");
    }
  };

  return (
    <div className="grid gap-2">
      <Button type="button" variant={prominent ? "default" : "outline"} size="lg" className="w-full" onClick={start} loading={starting}>
        {!starting && (prominent ? <span className="rounded-full bg-white p-1"><GoogleMark /></span> : <GoogleMark />)}
        เข้าสู่ระบบด้วย Google (@up.ac.th)
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        ใช้ได้เฉพาะบัญชี Google ของมหาวิทยาลัยที่ลงท้ายด้วย @{config.data.allowed_email_domain}
      </p>
    </div>
  );
}
