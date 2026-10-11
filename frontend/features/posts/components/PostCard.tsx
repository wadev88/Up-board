"use client";

import Link from "next/link";
import { CalendarDays, HardHat, MapPin } from "lucide-react";
import { useNow } from "@/hooks/useNow";
import { ANONYMOUS_AUTHOR, POST_TYPE_STYLES, ROLE_LABELS } from "@/lib/constants";
import { formatDateTime, formatRelative, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/avatar";
import { firstImage, hasDashboardExpiry, postHref } from "@/features/posts/utils";
import {
  CategoryTag,
  CountdownChip,
  EventPriorityBadge,
  EventStatusBadge,
  LifecycleBadge,
  PinBadge,
  PriorityBadge,
  StatusBadge,
  TYPE_ICONS,
  TypeBadge,
} from "@/features/posts/components/badges";
import { PostActionsMenu } from "@/features/posts/components/PostActionsMenu";
import type { Post } from "@/types/api";

interface PostCardProps {
  post: Post;
  /** override "now" (tests / shared ticking clock) */
  now?: number;
  /** show the 24h feed countdown chip (default true) */
  showCountdown?: boolean;
  /** show the permission-aware actions menu (needs the app router) */
  showActions?: boolean;
  headingLevel?: "h2" | "h3";
  className?: string;
}

/** Event time range: "12 ต.ค. 2569 09:00 – 12:00" or across days with both dates. */
export function formatEventRange(starts: string, ends: string | null): string {
  if (!ends) return formatDateTime(starts);
  const sameDay = new Date(starts).toDateString() === new Date(ends).toDateString();
  return sameDay
    ? `${formatDateTime(starts)} – ${formatTime(ends)}`
    : `${formatDateTime(starts)} – ${formatDateTime(ends)}`;
}

/**
 * Community post card: image or coloured type header → badges → title → preview → event /
 * location / repair details → author + relative time → contextual actions.
 * The whole card is one link (stretched title link); the actions menu sits above it.
 */
export function PostCard({
  post,
  now,
  showCountdown = true,
  showActions = false,
  headingLevel = "h3",
  className,
}: PostCardProps) {
  // only tick our own clock when the parent didn't pass a shared one
  const ownNow = useNow({ enabled: now === undefined });
  const current = now ?? ownNow;
  const Heading = headingLevel;
  const image = firstImage(post);
  const authorName = post.author?.display_name ?? ANONYMOUS_AUTHOR;
  const location = post.repair?.location ?? post.lost_found?.location ?? post.event?.venue ?? null;
  const TypeIcon = TYPE_ICONS[post.type];

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-card-hover",
        post.is_pinned && "border-primary/40",
        className,
      )}
      data-testid="post-card"
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- backend-served files (GET /files/{key})
        <img src={image.url} alt="" loading="lazy" className="h-40 w-full object-cover" />
      ) : (
        <div
          className={cn("flex h-16 items-center gap-2 px-4", POST_TYPE_STYLES[post.type])}
          aria-hidden="true"
        >
          <TypeIcon className="size-5" />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <TypeBadge type={post.type} />
          <CategoryTag category={post.category} />
          {post.priority !== "normal" && <PriorityBadge priority={post.priority} />}
          {post.is_pinned && <PinBadge pinnedUntil={post.pinned_until} now={current} />}
          <StatusBadge post={post} />
          {post.event && <EventStatusBadge event={post.event} now={current} />}
          {post.event && post.event.priority_level !== "department" && (
            <EventPriorityBadge level={post.event.priority_level} />
          )}
          <LifecycleBadge lifecycle={post.lifecycle} />
        </div>

        <Heading className="text-base font-semibold leading-snug [overflow-wrap:anywhere]">
          <Link
            href={postHref(post)}
            className="rounded-sm after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none"
          >
            {post.title}
          </Link>
        </Heading>

        {post.content && (
          <p className="line-clamp-3 text-sm text-muted-foreground [overflow-wrap:anywhere]">{post.content}</p>
        )}

        {(post.event || location || post.repair?.technician) && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {post.event && (
              <li className="flex items-start gap-1.5">
                <CalendarDays className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="sr-only">วันเวลากิจกรรม:</span>
                {formatEventRange(post.event.starts_at, post.event.ends_at)}
              </li>
            )}
            {location && (
              <li className="flex items-start gap-1.5">
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="sr-only">สถานที่:</span>
                <span className="[overflow-wrap:anywhere]">{location}</span>
              </li>
            )}
            {post.repair?.technician && (
              <li className="flex items-start gap-1.5">
                <HardHat className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="sr-only">ช่างผู้รับผิดชอบ:</span>
                {post.repair.technician.display_name}
              </li>
            )}
          </ul>
        )}

        <div className="mt-auto flex items-center gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
          <UserAvatar name={authorName} className="size-7 text-xs" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-foreground" data-testid="post-author">
              {post.author ? (
                <Link href={`/users/${post.author.id}`} className="relative z-10 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {authorName}
                </Link>
              ) : (
                authorName
              )}
              {post.author && post.author.role !== "student" && (
                <span className="font-normal text-muted-foreground"> · {ROLE_LABELS[post.author.role]}</span>
              )}
            </p>
            <p className="flex flex-wrap items-center gap-x-2">
              <time dateTime={post.created_at} title={formatDateTime(post.created_at)}>
                {formatRelative(post.created_at, current)}
              </time>
              {showCountdown && hasDashboardExpiry(post.type) && post.lifecycle === "active" && (
                <CountdownChip expiresAt={post.dashboard_expires_at} now={current} />
              )}
            </p>
          </div>
          {showActions && (
            <div className="relative z-10">
              <PostActionsMenu post={post} />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function PostCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card" aria-hidden="true">
      <div className="h-16 animate-pulse bg-muted" />
      <div className="space-y-3 p-4">
        <div className="flex gap-2">
          <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
          <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="flex items-center gap-2 pt-2">
          <div className="size-7 animate-pulse rounded-full bg-muted" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

/** Responsive card grid: 1 column on phones, 2 on tablets, 3 on desktop. */
export const POST_GRID = "grid gap-4 sm:grid-cols-2 md:gap-5 xl:grid-cols-3";

export function PostListSkeleton({ count = 3, grid = true }: { count?: number; grid?: boolean }) {
  return (
    <div className={grid ? POST_GRID : "space-y-4"} role="status" aria-label="กำลังโหลดโพสต์">
      {Array.from({ length: count }).map((_, i) => (
        <PostCardSkeleton key={i} />
      ))}
    </div>
  );
}
