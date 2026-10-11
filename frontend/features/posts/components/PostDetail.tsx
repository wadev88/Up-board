"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNow } from "@/hooks/useNow";
import { ANONYMOUS_AUTHOR, ROLE_LABELS } from "@/lib/constants";
import { formatDateTime, formatRelative } from "@/lib/format";
import { hasDashboardExpiry } from "@/features/posts/utils";
import {
  CategoryTag,
  CountdownChip,
  EventStatusBadge,
  LifecycleBadge,
  PinBadge,
  PriorityBadge,
  StatusBadge,
  TypeBadge,
} from "@/features/posts/components/badges";
import { AttachmentGallery } from "@/features/posts/components/AttachmentGallery";
import { PostActionsMenu } from "@/features/posts/components/PostActionsMenu";
import { EventInfoBlock } from "@/features/events/components/EventInfoBlock";
import type { Post } from "@/types/api";

interface PostDetailProps {
  post: Post;
  backHref: string;
  backLabel: string;
  /** type-specific panels rendered after the content */
  children?: React.ReactNode;
  /** extra info shown above the content (e.g. location) */
  meta?: React.ReactNode;
}

export function PostDetail({ post, backHref, backLabel, children, meta }: PostDetailProps) {
  const now = useNow();
  const images = post.attachments.filter((a) => a.kind === "image");
  const afterImages = post.attachments.filter((a) => a.kind === "repair_after");

  return (
    <article className="mx-auto max-w-[720px] space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href={backHref}>
            <ArrowLeft aria-hidden="true" />
            {backLabel}
          </Link>
        </Button>
        <PostActionsMenu post={post} afterDeleteHref={backHref} />
      </div>

      {post.lifecycle === "archived" ? (
        <p role="status" className="rounded-2xl border border-border bg-muted p-3 text-sm text-muted-foreground">
          โพสต์นี้ถูกเก็บถาวรอัตโนมัติเพราะครบ 7 วันแล้ว — เห็นได้เฉพาะคุณในประวัติโพสต์
        </p>
      ) : post.status === "removed" ? (
        <p role="status" className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          โพสต์นี้ถูกนำออกโดยผู้ดูแลระบบ
        </p>
      ) : post.lifecycle === "expired" ? (
        <p role="status" className="rounded-2xl border border-border bg-muted p-3 text-sm text-muted-foreground">
          {post.type === "event"
            ? "กิจกรรมนี้จบแล้ว จึงไม่แสดงในรายการกิจกรรมที่กำลังจะมาถึง"
            : "โพสต์นี้เกิน 24 ชั่วโมงแล้ว จึงไม่แสดงในฟีด แต่ยังอยู่ในประวัติโพสต์ของผู้เขียน"}
        </p>
      ) : null}

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <TypeBadge type={post.type} />
          <CategoryTag category={post.category} />
          {post.priority !== "normal" && <PriorityBadge priority={post.priority} />}
          {post.is_pinned && <PinBadge pinnedUntil={post.pinned_until} now={now} />}
          <StatusBadge post={post} />
          {post.event && <EventStatusBadge event={post.event} now={now} />}
          <LifecycleBadge lifecycle={post.lifecycle} />
        </div>
        <h1 className="text-2xl font-semibold leading-tight tracking-tight [overflow-wrap:anywhere]">{post.title}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <UserAvatar name={post.author?.display_name ?? "U"} className="size-6 text-xs" />
            {post.author ? (
              <Link href={`/users/${post.author.id}`} className="text-foreground hover:underline">
                {post.author.display_name}
              </Link>
            ) : (
              <span className="text-foreground">{ANONYMOUS_AUTHOR}</span>
            )}
            {post.author && <span>· {ROLE_LABELS[post.author.role]}</span>}
          </span>
          <time dateTime={post.created_at} title={formatDateTime(post.created_at)}>
            {formatRelative(post.created_at, now)}
          </time>
          {post.faculty && (
            <Link href={`/faculty/${post.faculty.id}`} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
              <Building2 className="size-3.5" aria-hidden="true" />
              {post.faculty.name_th}
            </Link>
          )}
          {hasDashboardExpiry(post.type) && post.lifecycle === "active" && (
            <CountdownChip expiresAt={post.dashboard_expires_at} now={now} />
          )}
        </div>
      </header>

      {post.related_repair_id !== null && post.related_repair_id !== undefined && (
        <p className="rounded-xl border border-border bg-subtle p-3 text-sm">
          ประกาศนี้เกี่ยวกับงานแจ้งซ่อม{" "}
          <Link href={`/repairs/${post.related_repair_id}`} className="font-medium text-primary underline-offset-4 hover:underline">
            ดูงานซ่อม #{post.related_repair_id}
          </Link>
        </p>
      )}

      {meta}
      {post.event && <EventInfoBlock event={post.event} />}

      <div className="whitespace-pre-wrap break-words leading-relaxed">{post.content}</div>

      <AttachmentGallery attachments={images} title="รูปภาพประกอบ" />
      {afterImages.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">รูปหลังซ่อม</h2>
          <AttachmentGallery attachments={afterImages} title="รูปหลังซ่อม" />
        </div>
      )}

      {children}
    </article>
  );
}

export function PostDetailSkeleton() {
  return (
    <div className="mx-auto max-w-[720px] space-y-4" role="status" aria-label="กำลังโหลด">
      <Skeleton className="h-9 w-28" />
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}
