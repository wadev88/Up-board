import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/features/auth/components/LoginForm";

export const metadata: Metadata = { title: "เข้าสู่ระบบ" };

export default function LoginPage() {
  return (
    <div className="grid gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">เข้าสู่ระบบ</h1>
        <p className="text-sm text-muted-foreground">สำหรับนิสิต อาจารย์ และบุคลากรมหาวิทยาลัยพะเยา (@up.ac.th)</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
