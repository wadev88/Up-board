"use client";

import { Ban } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNow } from "@/hooks/useNow";
import { formatDate, formatDateTime } from "@/lib/format";

/** True while the API reports an active posting suspension (spam policy, ADR-003). */
export function useSuspendedUntil(): string | null {
  const { user } = useAuth();
  const now = useNow({ enabled: !!user?.posting_suspended_until });
  const until = user?.posting_suspended_until;
  return until && new Date(until).getTime() > now ? until : null;
}

export function SuspensionNotice({ className }: { className?: string }) {
  const until = useSuspendedUntil();
  const { user } = useAuth();
  const suspension = user?.suspension;
  if (!until) return null;
  return (
    <div
      role="status"
      className={
        "flex items-start gap-3 rounded-2xl border border-orange-200 bg-secondary-soft p-4 text-sm text-orange-900 dark:border-orange-900 dark:text-orange-100 " +
        (className ?? "")
      }
      data-testid="suspension-notice"
    >
      <Ban className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>
        <strong className="font-semibold">บัญชีของคุณถูกระงับการโพสต์ชั่วคราว</strong> เนื่องจากโพสต์ทั่วไปติดต่อกันหลายครั้งในวันเดียว
        {suspension && (
          <>
            {" "}(ตั้งแต่ <time dateTime={suspension.starts_at}>{formatDateTime(suspension.starts_at)}</time> ถึงสิ้นวันที่{" "}
            <time dateTime={suspension.last_day}>{formatDate(suspension.last_day)}</time>)
          </>
        )}{" "}
        โพสต์ได้อีกครั้ง <time dateTime={until}>{formatDateTime(until)}</time> — ระหว่างนี้ยังอ่านโพสต์ ดูโปรไฟล์ และดูประวัติได้ตามปกติ
      </p>
    </div>
  );
}

export function AccountNotices() {
  const { user } = useAuth();
  if (!user?.posting_suspended_until) return null;
  return (
    <div className="mb-6 space-y-3">
      <SuspensionNotice />
    </div>
  );
}
