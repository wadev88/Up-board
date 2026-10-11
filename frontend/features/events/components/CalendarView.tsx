"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { EVENT_PRIORITY_LABELS, EVENT_PRIORITY_ORDER } from "@/lib/constants";
import { formatTime, LOCALE, TIME_ZONE } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useEvents } from "@/features/events/hooks";
import { postHref } from "@/features/posts/utils";
import type { EventPriority, Post } from "@/types/api";

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"] as const;

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" of an instant in Bangkok time. */
export function bangkokDayKey(value: string | number | Date): string {
  return dayFormatter.format(new Date(value));
}

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** Start of a Bangkok calendar month as a UTC instant. */
function monthStartUtc(year: number, month: number): number {
  return Date.UTC(year, month, 1) - BKK_OFFSET_MS;
}

/** Every Bangkok day (YYYY-MM-DD) an event touches, from its start to its end. */
export function eventDayKeys(post: Post): string[] {
  const ev = post.event;
  if (!ev) return [];
  const first = bangkokDayKey(ev.starts_at);
  const last = ev.ends_at ? bangkokDayKey(ev.ends_at) : first;
  const keys: string[] = [];
  // walk in whole days from the first key (noon avoids any boundary rounding)
  let t = new Date(`${first}T12:00:00+07:00`).getTime();
  const end = new Date(`${last}T12:00:00+07:00`).getTime();
  for (let i = 0; t <= end && i < 62; i++, t += DAY_MS) keys.push(bangkokDayKey(t));
  return keys.length ? keys : [first];
}

const PRIORITY_DOT: Record<EventPriority, string> = {
  university: "bg-fuchsia-600",
  faculty: "bg-blue-600",
  department: "bg-emerald-600",
};

const monthLabel = new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", month: "long", year: "numeric" });

/** Month grid of events (GET /events with from / to). Tap a day to list its events. */
export function CalendarView() {
  const [nowMs] = useState(() => Date.now());
  const today = bangkokDayKey(nowMs);
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split("-").map(Number);
    return { year: y, month: m - 1 };
  });
  const [selected, setSelected] = useState<string>(today);
  const { year, month } = cursor;

  const from = new Date(monthStartUtc(year, month)).toISOString();
  const to = new Date(monthStartUtc(year, month + 1)).toISOString();
  const q = useEvents({ from, to });

  const byDay = new Map<string, Post[]>();
  for (const p of q.data ?? []) {
    for (const k of eventDayKeys(p)) {
      const list = byDay.get(k) ?? [];
      list.push(p);
      byDay.set(k, list);
    }
  }

  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const go = (delta: number) => {
    const d = new Date(Date.UTC(year, month + delta, 1));
    const next = { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    setCursor(next);
    // keep the selection inside the visible month
    const isCurrent = today.startsWith(`${next.year}-${pad(next.month + 1)}`);
    setSelected(isCurrent ? today : dayKey(next.year, next.month, 1));
  };
  const goToday = () => {
    const [y, m] = today.split("-").map(Number);
    setCursor({ year: y, month: m - 1 });
    setSelected(today);
  };

  const dayEvents = (byDay.get(selected) ?? [])
    .slice()
    .sort((a, b) => new Date(a.event!.starts_at).getTime() - new Date(b.event!.starts_at).getTime());
  const selectedLabel = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${selected}T12:00:00+07:00`));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle as="h2" aria-live="polite">
            {monthLabel.format(new Date(Date.UTC(year, month, 1)))}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={goToday}>
              วันนี้
            </Button>
            <Button variant="ghost" size="icon" onClick={() => go(-1)} aria-label="เดือนก่อนหน้า">
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => go(1)} aria-label="เดือนถัดไป">
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground" aria-hidden="true">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div
            className={cn("mt-1 grid grid-cols-7 gap-1", q.isFetching && "opacity-70")}
            role="grid"
            aria-label="ปฏิทินกิจกรรม"
            aria-busy={q.isFetching || undefined}
          >
            {cells.map((d, i) => {
              if (d === null) return <div key={`b${i}`} role="gridcell" aria-hidden="true" />;
              const key = dayKey(year, month, d);
              const events = byDay.get(key) ?? [];
              const isToday = key === today;
              const isSelected = key === selected;
              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  aria-selected={isSelected}
                  aria-current={isToday ? "date" : undefined}
                  aria-label={`${d} ${events.length ? `มี ${events.length} กิจกรรม` : "ไม่มีกิจกรรม"}`}
                  onClick={() => setSelected(key)}
                  className={cn(
                    "flex min-h-12 flex-col items-center gap-1 rounded-lg border p-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-20 sm:items-start sm:p-2",
                    isSelected ? "border-primary bg-primary-soft" : "border-transparent hover:bg-muted",
                    isToday && !isSelected && "border-border",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-full text-xs font-medium",
                      isToday && "bg-primary text-primary-foreground",
                    )}
                  >
                    {d}
                  </span>
                  {events.length > 0 && (
                    <>
                      <span className="flex gap-0.5 sm:hidden" aria-hidden="true">
                        {events.slice(0, 3).map((e) => (
                          <span key={e.id} className={cn("size-1.5 rounded-full", PRIORITY_DOT[e.event!.priority_level])} />
                        ))}
                      </span>
                      <span className="hidden w-full min-w-0 space-y-0.5 text-left sm:block" aria-hidden="true">
                        {events.slice(0, 2).map((e) => (
                          <span key={e.id} className="flex items-center gap-1 truncate text-[11px] leading-tight">
                            <span className={cn("size-1.5 shrink-0 rounded-full", PRIORITY_DOT[e.event!.priority_level])} />
                            <span className="truncate">{e.title}</span>
                          </span>
                        ))}
                        {events.length > 2 && <span className="block text-[11px] text-muted-foreground">+{events.length - 2} รายการ</span>}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="คำอธิบายสี">
            {EVENT_PRIORITY_ORDER.map((p) => (
              <li key={p} className="flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", PRIORITY_DOT[p])} aria-hidden="true" />
                {EVENT_PRIORITY_LABELS[p]}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <section aria-labelledby="calendar-day-title" className="space-y-3">
        <h2 id="calendar-day-title" className="flex items-center gap-2 text-base font-semibold">
          <CalendarDays className="size-5 text-primary" aria-hidden="true" />
          {selectedLabel}
        </h2>
        {q.isLoading ? (
          <Skeleton className="h-24 w-full rounded-2xl" />
        ) : dayEvents.length === 0 ? (
          <EmptyState icon={<CalendarDays />} title="ไม่มีกิจกรรมในวันนี้" description="เลือกวันอื่นในปฏิทินเพื่อดูกิจกรรม" />
        ) : (
          <ul className="space-y-2">
            {dayEvents.map((p) => (
              <li key={p.id}>
                <Link
                  href={postHref(p)}
                  className="block rounded-2xl border border-border/70 bg-card p-3 shadow-card transition-shadow hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="mb-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="accent">{EVENT_PRIORITY_LABELS[p.event!.priority_level]}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(p.event!.starts_at)}
                      {p.event!.ends_at && ` – ${formatTime(p.event!.ends_at)}`}
                    </span>
                  </span>
                  <span className="block text-sm font-medium">{p.title}</span>
                  {p.event!.venue && <span className="block text-xs text-muted-foreground">{p.event!.venue}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
