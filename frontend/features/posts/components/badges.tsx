import {
  AlertTriangle,
  Archive,
  CalendarDays,
  Clock,
  Megaphone,
  MessageSquare,
  PackageSearch,
  Pin,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  EVENT_PRIORITY_LABELS,
  LOST_FOUND_STATUS_LABELS,
  LOST_FOUND_STATUS_STYLES,
  POST_TYPE_LABELS,
  POST_TYPE_STYLES,
  PRIORITY_LABELS,
  PRIORITY_STYLES,
  REPAIR_STATUS_LABELS,
  REPAIR_STATUS_STYLES,
} from "@/lib/constants";
import { dashboardCountdown, pinCountdown } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  Category,
  EventInfo,
  EventPriority,
  LostFoundStatus,
  Post,
  PostType,
  Priority,
  RepairStatus,
} from "@/types/api";

export const TYPE_ICONS: Record<PostType, typeof Wrench> = {
  general: MessageSquare,
  announcement: Megaphone,
  event: CalendarDays,
  repair: Wrench,
  lost_found: PackageSearch,
};

/** Coloured post-type badge (icon + text — colour is never the only signal). */
export function TypeBadge({ type }: { type: PostType }) {
  const Icon = TYPE_ICONS[type];
  return (
    <Badge variant="custom" className={cn("ring-transparent", POST_TYPE_STYLES[type])} data-testid="type-badge">
      <Icon aria-hidden="true" />
      {POST_TYPE_LABELS[type]}
    </Badge>
  );
}

export function EventPriorityBadge({ level }: { level: EventPriority }) {
  return (
    <Badge variant={level === "department" ? "outline" : "accent"} data-testid="event-priority-badge">
      {EVENT_PRIORITY_LABELS[level]}
    </Badge>
  );
}

/** Upcoming / happening now / ended, from the event times. */
export function EventStatusBadge({ event, now }: { event: EventInfo; now: number }) {
  const start = new Date(event.starts_at).getTime();
  const end = new Date(event.ends_at ?? event.starts_at).getTime();
  if (end <= now) return <Badge variant="outline">จบแล้ว</Badge>;
  if (start <= now) return <Badge variant="warning">กำลังจัดอยู่</Badge>;
  return <Badge variant="accent">กำลังจะมาถึง</Badge>;
}

/** History-only states from the server's lifecycle (expired / archived). */
export function LifecycleBadge({ lifecycle }: { lifecycle: Post["lifecycle"] }) {
  if (lifecycle === "expired") {
    return (
      <Badge variant="outline" data-testid="lifecycle-badge">
        <Clock aria-hidden="true" />
        หมดเวลาแสดงในฟีด
      </Badge>
    );
  }
  if (lifecycle === "archived") {
    return (
      <Badge variant="outline" data-testid="lifecycle-badge">
        <Archive aria-hidden="true" />
        เก็บถาวร (เกิน 7 วัน)
      </Badge>
    );
  }
  return null;
}

export function PostTypeIcon({ type, className }: { type: PostType; className?: string }) {
  const Icon = TYPE_ICONS[type];
  return (
    <span
      className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground", className)}
      title={POST_TYPE_LABELS[type]}
    >
      <Icon className="size-4" aria-hidden="true" />
      <span className="sr-only">{POST_TYPE_LABELS[type]}</span>
    </span>
  );
}

export function CategoryTag({ category }: { category: Pick<Category, "name_th"> }) {
  return <Badge variant="outline">{category.name_th}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge variant="custom" className={PRIORITY_STYLES[priority]} data-testid="priority-badge">
      {(priority === "urgent" || priority === "high") && <AlertTriangle aria-hidden="true" />}
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}

export function RepairStatusBadge({ status }: { status: RepairStatus }) {
  return (
    <Badge variant="custom" className={REPAIR_STATUS_STYLES[status]} data-testid="status-badge">
      {REPAIR_STATUS_LABELS[status]}
    </Badge>
  );
}

export function LostFoundStatusBadge({ status }: { status: LostFoundStatus }) {
  return (
    <Badge variant="custom" className={LOST_FOUND_STATUS_STYLES[status]} data-testid="status-badge">
      {LOST_FOUND_STATUS_LABELS[status]}
    </Badge>
  );
}

/** Repair or lost & found status, whichever applies. */
export function StatusBadge({ post }: { post: Pick<Post, "repair" | "lost_found"> }) {
  if (post.repair) return <RepairStatusBadge status={post.repair.status} />;
  if (post.lost_found) return <LostFoundStatusBadge status={post.lost_found.status} />;
  return null;
}

/** Render only when the server says the pin is active (`post.is_pinned`); scheduled event pins
 * are not. Uses the server flag rather than comparing with the browser clock (clock skew). */
export function PinBadge({ pinnedUntil, now }: { pinnedUntil: string | null; now: number }) {
  const c = pinCountdown(pinnedUntil, now);
  if (!c) return null;
  return (
    <Badge variant="accent" data-testid="pin-badge">
      <Pin aria-hidden="true" />
      {c.label}
    </Badge>
  );
}

export function CountdownChip({ expiresAt, now }: { expiresAt: string; now: number }) {
  const c = dashboardCountdown(expiresAt, now);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        c.expired ? "text-muted-foreground" : "text-foreground/80",
      )}
      data-testid="countdown-chip"
    >
      <Clock className="size-3" aria-hidden="true" />
      {c.label}
    </span>
  );
}
