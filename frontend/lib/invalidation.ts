import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { Post, PostType } from "@/types/api";

/**
 * Cache invalidation rules shared by mutations (features/*\/hooks.ts) and the
 * SSE stream (services/sse.ts).
 *
 * Detail queries are never invalidated wholesale: a mutation that returns the
 * post writes it with `setQueryData`, so refetching it again would only add a
 * redundant request on the page the user is looking at.
 */

/** Lists that can contain a post of any type, plus dashboard and events. */
export function invalidatePostLists(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: queryKeys.posts.lists });
  void qc.invalidateQueries({ queryKey: queryKeys.dashboard });
  void qc.invalidateQueries({ queryKey: queryKeys.eventsAll });
  void qc.invalidateQueries({ queryKey: queryKeys.repairs.lists });
  void qc.invalidateQueries({ queryKey: queryKeys.lostFound.lists });
}

/** After a mutation: write the returned post into its detail cache, refresh lists. */
export function applyPostMutation(qc: QueryClient, post?: Post) {
  if (post) {
    qc.setQueryData(queryKeys.posts.detail(post.id), post);
  }
  invalidatePostLists(qc);
}

/** Lists affected by a newly created post of the given type (SSE `post.created`). */
export function invalidateForNewPost(qc: QueryClient, type: PostType) {
  void qc.invalidateQueries({ queryKey: queryKeys.dashboard });
  switch (type) {
    case "repair":
      void qc.invalidateQueries({ queryKey: queryKeys.repairs.lists });
      break;
    case "lost_found":
      void qc.invalidateQueries({ queryKey: queryKeys.lostFound.lists });
      break;
    default:
      void qc.invalidateQueries({ queryKey: queryKeys.posts.lists });
      void qc.invalidateQueries({ queryKey: queryKeys.eventsAll });
  }
}

/** A repair changed status (SSE `repair.updated`). Repairs live under posts.detail. */
export function invalidateForRepairUpdate(qc: QueryClient, id: number) {
  void qc.invalidateQueries({
    queryKey: queryKeys.posts.detail(id),
    exact: true,
  });
  void qc.invalidateQueries({ queryKey: queryKeys.repairs.lists });
  void qc.invalidateQueries({ queryKey: queryKeys.dashboard });
}

/* ------------------------------------------------------------------ */
/* Echo suppression                                                     */
/* ------------------------------------------------------------------ */
/*
 * An SSE event is skipped only when the cache ALREADY reflects it — never on
 * "this tab touched that post recently". A time/id-based rule dropped other
 * users' changes: a reporter who had just created repair #X ignored the
 * technician assignment for #X arriving within the window (found by the
 * real-stack E2E suite).
 */

/** `post.created`: skip when this tab already holds the post (it created it). */
export function isKnownPost(qc: QueryClient, postId: number): boolean {
  return qc.getQueryData<Post>(queryKeys.posts.detail(postId)) !== undefined;
}

/** `repair.updated`: skip when the cached repair already has the event's status. */
export function isRepairStatusCurrent(
  qc: QueryClient,
  postId: number,
  status: string,
): boolean {
  const cached = qc.getQueryData<Post>(queryKeys.posts.detail(postId));
  return cached?.repair?.status === status;
}
