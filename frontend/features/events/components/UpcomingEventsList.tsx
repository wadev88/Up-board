"use client";

import Link from "next/link";
import { formatDateTime, formatDayOfMonth, formatMonthShort } from "@/lib/format";
import { postHref } from "@/features/posts/utils";
import type { Post } from "@/types/api";

/** Compact list of upcoming announcements (dashboard right rail, next 30 days). */
export function UpcomingEventsList({ posts }: { posts: Post[] }) {
  if (posts.length === 0) {
    return <p className="text-sm text-muted-foreground">ยังไม่มีกิจกรรมใน 30 วันข้างหน้า</p>;
  }
  return (
    <ul className="space-y-1">
      {posts.map((p) => {
        const start = p.event?.starts_at ?? null;
        return (
          <li key={p.id}>
            <Link
              href={postHref(p)}
              className="flex min-h-12 items-center gap-3 rounded-lg p-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {start && (
                <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg border border-border text-center leading-none" aria-hidden="true">
                  <span className="text-base font-semibold">
                    {formatDayOfMonth(start)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatMonthShort(start)}
                  </span>
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{p.title}</span>
                {p.event && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {formatDateTime(p.event.starts_at)}
                    {p.event.venue && ` · ${p.event.venue}`}
                  </span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
