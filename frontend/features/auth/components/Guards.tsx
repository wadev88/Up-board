"use client";

import * as React from "react";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ShieldOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { can, hasRole, type Permission } from "@/lib/permissions";
import { ErrorState } from "@/components/common/ErrorState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Post, Role } from "@/types/api";

/** Full-page skeleton shown while the session is being restored. */
export function SessionSkeleton() {
  return (
    <div className="min-h-dvh" role="status" aria-label="กำลังโหลดเซสชัน">
      <div className="flex h-16 items-center gap-4 border-b border-border/70 bg-card px-4 lg:px-8">
        <Skeleton className="h-9 w-32" />
        <div className="mx-auto hidden gap-2 lg:flex">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-full" />
          ))}
        </div>
        <Skeleton className="ml-auto size-9 rounded-full lg:ml-0" />
      </div>
      <div className="mx-auto max-w-7xl space-y-6 p-4 lg:p-8">
        <Skeleton className="h-48 w-full rounded-3xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-2xl" />
          ))}
        </div>
      </div>
      <span className="sr-only">กำลังโหลด…</span>
    </div>
  );
}

/** Redirects unauthenticated visitors to /login?next=<current path>. UX only. */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      const next = `${pathname}${typeof window !== "undefined" ? window.location.search : ""}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [status, pathname, router]);

  if (status !== "authenticated") return <SessionSkeleton />;
  return <>{children}</>;
}

/**
 * Self-registered accounts must choose student / teacher first (the API refuses to let them
 * act until then). Sends them to /onboarding. UX only.
 */
export function ProfileGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const pending = !!user && !user.profile_completed;

  useEffect(() => {
    if (pending) router.replace("/onboarding");
  }, [pending, router]);

  if (pending) return <SessionSkeleton />;
  return <>{children}</>;
}

/** Shows a 403 state when the user's role is not in `roles`. UX only. */
export function RoleGuard({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!hasRole(user, roles)) {
    return (
      <ErrorState
        icon={<ShieldOff />}
        title="ไม่มีสิทธิ์เข้าถึง (403)"
        description="หน้านี้สำหรับผู้ดูแลระบบเท่านั้น หากคิดว่าเป็นข้อผิดพลาด กรุณาติดต่อผู้ดูแล"
        action={
          <Button asChild variant="outline">
            <Link href="/dashboard">กลับหน้าแรก</Link>
          </Button>
        }
      />
    );
  }
  return <>{children}</>;
}

interface CanProps {
  perm: Permission;
  post?: Post | null;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/** Renders children when allowed. Uses `post.permissions` from the backend when available. */
export function Can({ perm, post, children, fallback = null }: CanProps) {
  const { user } = useAuth();
  return <>{can(user, perm, post ?? undefined) ? children : fallback}</>;
}
