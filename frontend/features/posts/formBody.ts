import { isoToLocalInput, localInputToIso } from "@/lib/format";
import type { PostFormValues } from "@/features/posts/schemas";
import type { CreatePostBody, EventInput, EventPriority, Post, UpdatePostBody } from "@/types/api";

type FormPostType = PostFormValues["type"];

/** Form values for a new post, or the current values of `post` when editing. */
export function postToFormValues(
  post?: Post,
  defaults: { type?: FormPostType; eventPriority?: EventPriority } = {},
): PostFormValues {
  let type: FormPostType = defaults.type ?? "general";
  if (post) type = post.type === "announcement" || post.type === "event" ? post.type : "general";
  return {
    type,
    title: post?.title ?? "",
    content: post?.content ?? "",
    priority: post?.priority ?? "normal",
    event_starts_at: post?.event ? isoToLocalInput(post.event.starts_at) : "",
    event_ends_at: post?.event?.ends_at ? isoToLocalInput(post.event.ends_at) : "",
    event_venue: post?.event?.venue ?? "",
    event_priority: post?.event?.priority_level ?? defaults.eventPriority ?? "department",
    related_repair_id: post?.related_repair_id ?? 0,
    attachment_ids: post?.attachments.filter((a) => a.kind === "image").map((a) => a.id) ?? [],
  };
}

function toEvent(v: PostFormValues): EventInput | undefined {
  if (v.type !== "event" || !v.event_starts_at || !v.event_ends_at) return undefined;
  return {
    starts_at: localInputToIso(v.event_starts_at),
    ends_at: localInputToIso(v.event_ends_at),
    venue: v.event_venue?.trim() ? v.event_venue.trim() : null,
    priority_level: v.event_priority,
  };
}

export function buildCreatePostBody(v: PostFormValues): CreatePostBody {
  const event = toEvent(v);
  return {
    type: v.type,
    title: v.title,
    content: v.content,
    priority: v.priority,
    attachment_ids: v.attachment_ids,
    ...(v.type === "announcement" && v.related_repair_id > 0 ? { related_repair_id: v.related_repair_id } : {}),
    ...(event ? { event } : {}),
  };
}

const sameIds = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

const norm = (s: string | undefined) => (s ?? "").trim();

/**
 * PATCH body containing only the fields that differ from `initial`.
 *
 * `attachment_ids` in particular is sent only when the images changed: the
 * backend validates every id it receives, so re-sending an unchanged list
 * (possibly holding another user's uploads, e.g. when an admin edits a post) must
 * be avoided. The category follows the post type on the server. Repairs / lost & found never send an event.
 */
export function buildUpdatePostBody(
  initial: PostFormValues,
  v: PostFormValues,
  { isSpecialType = false }: { isSpecialType?: boolean } = {},
): UpdatePostBody {
  const body: UpdatePostBody = {};
  if (norm(v.title) !== norm(initial.title)) body.title = v.title;
  if (norm(v.content) !== norm(initial.content)) body.content = v.content;
  if (v.priority !== initial.priority) body.priority = v.priority;
  if (!sameIds(v.attachment_ids, initial.attachment_ids)) body.attachment_ids = v.attachment_ids;
  if (!isSpecialType) {
    if (v.type === "announcement" && v.related_repair_id !== initial.related_repair_id) {
      body.related_repair_id = v.related_repair_id > 0 ? v.related_repair_id : null;
    }
    const eventChanged =
      norm(v.event_starts_at) !== norm(initial.event_starts_at) ||
      norm(v.event_ends_at) !== norm(initial.event_ends_at) ||
      norm(v.event_venue) !== norm(initial.event_venue) ||
      v.event_priority !== initial.event_priority;
    const event = toEvent(v);
    if (eventChanged && event) body.event = event;
  }
  return body;
}
