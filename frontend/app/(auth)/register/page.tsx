import type { Metadata } from "next";
import { RegisterGate } from "@/features/auth/components/RegisterGate";

export const metadata: Metadata = { title: "สมัครสมาชิก" };

export default function RegisterPage() {
  return (
    <div className="grid gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">สมัครสมาชิก</h1>
        <p className="text-sm text-muted-foreground">สำหรับนิสิตและบุคลากรมหาวิทยาลัยพะเยา</p>
      </div>
      <RegisterGate />
    </div>
  );
}
