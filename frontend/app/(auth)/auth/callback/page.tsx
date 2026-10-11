import type { Metadata } from "next";
import { Suspense } from "react";
import { GoogleCallback } from "@/features/auth/components/GoogleCallback";

export const metadata: Metadata = { title: "กำลังเข้าสู่ระบบ" };

export default function GoogleCallbackPage() {
  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold tracking-tight">เข้าสู่ระบบด้วย Google</h1>
      <Suspense>
        <GoogleCallback />
      </Suspense>
    </div>
  );
}
