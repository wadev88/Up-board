"use client";

import Link from "next/link";
import { MapPin, PackageSearch } from "lucide-react";
import { ANONYMOUS_AUTHOR } from "@/lib/constants";
import { formatRelative } from "@/lib/format";
import { firstImage } from "@/features/posts/utils";
import { LostFoundStatusBadge } from "@/features/posts/components/badges";
import type { Post } from "@/types/api";

/** Grid tile for lost & found items (image-first). */
export function LostFoundCard({ post, now }: { post: Post; now: number }) {
  const image = firstImage(post);
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-card-hover">
      <div className="aspect-[4/3] bg-emerald-50 dark:bg-emerald-950/40">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- backend-served files
          <img src={image.url} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-emerald-700 dark:text-emerald-300" aria-hidden="true">
            <PackageSearch className="size-8" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        {post.lost_found && (
          <div>
            <LostFoundStatusBadge status={post.lost_found.status} />
          </div>
        )}
        <h2 className="line-clamp-2 font-semibold leading-snug">
          <Link href={`/lost-found/${post.id}`} className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none">
            {post.title}
          </Link>
        </h2>
        {post.lost_found && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{post.lost_found.location}</span>
          </p>
        )}
        {post.content && <p className="line-clamp-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">{post.content}</p>}
        <p className="mt-auto flex items-center gap-1.5 border-t border-border/60 pt-2 text-xs text-muted-foreground">
          <span className="truncate">{post.author?.display_name ?? ANONYMOUS_AUTHOR}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={post.created_at}>{formatRelative(post.created_at, now)}</time>
        </p>
      </div>
    </article>
  );
}
