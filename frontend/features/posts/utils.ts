import type { Post, PostType } from "@/types/api";

/** Detail route for a post according to its type. */
export function postHref(post: Pick<Post, "id" | "type">): string {
  switch (post.type) {
    case "repair":
      return `/repairs/${post.id}`;
    case "lost_found":
      return `/lost-found/${post.id}`;
    default:
      return `/posts/${post.id}`;
  }
}

/**
 * Post types that leave the feeds 24h after creation (ADR-003). Events stay until they end,
 * repairs until resolved, lost & found until returned / 30 days.
 */
export function hasDashboardExpiry(type: PostType): boolean {
  return type === "general" || type === "announcement";
}

export function firstImage(post: Pick<Post, "attachments">) {
  return post.attachments.find((a) => a.kind === "image") ?? null;
}
