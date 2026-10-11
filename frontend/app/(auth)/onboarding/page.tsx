import type { Metadata } from "next";
import { OnboardingForm } from "@/features/auth/components/OnboardingForm";

export const metadata: Metadata = { title: "ตั้งค่าบัญชี" };

export default function OnboardingPage() {
  return (
    <div className="grid gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">ตั้งค่าบัญชีครั้งแรก</h1>
        <p className="text-sm text-muted-foreground">ระบุคณะของคุณเพื่อเริ่มใช้งาน UP Board</p>
      </div>
      <OnboardingForm />
    </div>
  );
}
