"use client";

import { AuthGuard, ProfileGate } from "@/features/auth/components/Guards";
import { AppShell } from "@/components/layout/AppShell";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <ProfileGate>
        <AppShell>{children}</AppShell>
      </ProfileGate>
    </AuthGuard>
  );
}
