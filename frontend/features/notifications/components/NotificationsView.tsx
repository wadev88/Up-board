"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { Pagination } from "@/components/common/Pagination";
import { useNow } from "@/hooks/useNow";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/services/apiClient";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from "@/features/notifications/hooks";
import type { Notification } from "@/types/api";

/** Only follow in-app relative links from notifications. */
function safeLink(link: string | null): string | null {
  return link && link.startsWith("/") && !link.startsWith("//") ? link : null;
}

function NotificationItem({ n, now, onRead }: { n: Notification; now: number; onRead: (id: number) => void }) {
  const unread = !n.read_at;
  const href = safeLink(n.link);
  const body = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className={cn("text-sm", unread ? "font-semibold" : "font-medium")}>
          {unread && <span className="sr-only">ยังไม่อ่าน: </span>}
          {n.title}
        </span>
        <time dateTime={n.created_at} title={formatDateTime(n.created_at)} className="shrink-0 text-xs text-muted-foreground">
          {formatRelative(n.created_at, now)}
        </time>
      </span>
      {n.body && <span className="mt-1 block text-sm text-muted-foreground">{n.body}</span>}
    </>
  );
  return (
    <li className={cn("relative rounded-xl border border-border", unread && "border-primary/30 bg-primary/5")}>
      {unread && <span className="absolute left-2 top-5 size-2 rounded-full bg-primary" aria-hidden="true" />}
      <div className="flex items-start gap-2 p-4 pl-6">
        {href ? (
          <Link href={href} onClick={() => unread && onRead(n.id)} className="block min-w-0 flex-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {body}
          </Link>
        ) : (
          <div className="min-w-0 flex-1">{body}</div>
        )}
        {unread && (
          <Button variant="ghost" size="icon-sm" onClick={() => onRead(n.id)} aria-label={`ทำเครื่องหมายว่าอ่านแล้ว: ${n.title}`}>
            <CheckCheck aria-hidden="true" />
          </Button>
        )}
      </div>
    </li>
  );
}

export function NotificationsView() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const now = useNow();
  const q = useNotifications({ unread_only: unreadOnly || undefined, page, page_size: DEFAULT_PAGE_SIZE });
  const unread = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const onRead = (id: number) =>
    markRead.mutate(id, { onError: (e) => toast.error(getErrorMessage(e)) });

  return (
    <div className="mx-auto max-w-[720px]">
      <PageHeader
        title="การแจ้งเตือน"
        description={unread.data ? `ยังไม่อ่าน ${unread.data.count} รายการ` : undefined}
        actions={
          <Button
            variant="outline"
            onClick={() =>
              markAll.mutate(undefined, {
                onSuccess: () => toast.success("อ่านทั้งหมดแล้ว"),
                onError: (e) => toast.error(getErrorMessage(e)),
              })
            }
            loading={markAll.isPending}
            disabled={!unread.data?.count}
          >
            <CheckCheck aria-hidden="true" />
            อ่านทั้งหมด
          </Button>
        }
      />
      <Tabs
        value={unreadOnly ? "unread" : "all"}
        onValueChange={(v) => {
          setUnreadOnly(v === "unread");
          setPage(1);
        }}
      >
        <TabsList>
          <TabsTrigger value="all">ทั้งหมด</TabsTrigger>
          <TabsTrigger value="unread">ยังไม่อ่าน</TabsTrigger>
        </TabsList>
      <TabsContent value={unreadOnly ? "unread" : "all"} aria-live="polite">
        {q.isLoading ? (
          <div className="space-y-3" role="status" aria-label="กำลังโหลด">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data || q.data.items.length === 0 ? (
          <EmptyState icon={<Bell />} title={unreadOnly ? "อ่านครบทุกรายการแล้ว" : "ยังไม่มีการแจ้งเตือน"} />
        ) : (
          <div className="space-y-5">
            <ul className="space-y-3">
              {q.data.items.map((n) => (
                <NotificationItem key={n.id} n={n} now={now} onRead={onRead} />
              ))}
            </ul>
            <Pagination page={q.data.page} pageSize={q.data.page_size} total={q.data.total} onPageChange={setPage} />
          </div>
        )}
      </TabsContent>
      </Tabs>
    </div>
  );
}
