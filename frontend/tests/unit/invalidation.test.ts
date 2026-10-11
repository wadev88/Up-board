import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { applyPostMutation } from "@/lib/invalidation";
import { invalidateForEvent } from "@/services/sse";
import { makePost, makeRepair } from "../fixtures";

/** Seed one query per key family and report which ones end up invalidated. */
function setup() {
  const qc = new QueryClient();
  const keys = {
    postDetail: queryKeys.posts.detail(42),
    otherDetail: queryKeys.posts.detail(7),
    postList: queryKeys.posts.list({ page: 1 }),
    dashboard: queryKeys.dashboard,
    events: queryKeys.events({ from: "a", to: "b" }),
    repairList: queryKeys.repairs.list({ mine: true }),
    lostFoundList: queryKeys.lostFound.list({ status: "lost" }),
    notifications: queryKeys.notifications.list({ page: 1 }),
  };
  for (const key of Object.values(keys)) qc.setQueryData(key, { seeded: true });
  const invalidated = () =>
    Object.fromEntries(
      Object.entries(keys).map(([name, key]) => [
        name,
        qc.getQueryState(key)?.isInvalidated ?? false,
      ]),
    ) as Record<keyof typeof keys, boolean>;
  return { qc, invalidated };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("applyPostMutation (shared useInvalidatePosts)", () => {
  it("writes the returned post into its detail cache and does NOT invalidate any detail", () => {
    const { qc, invalidated } = setup();
    const post = makePost({ id: 42, title: "แก้ไขแล้ว" });
    applyPostMutation(qc, post);

    expect(qc.getQueryData(queryKeys.posts.detail(42))).toEqual(post);
    const state = invalidated();
    expect(state.postDetail).toBe(false);
    expect(state.otherDetail).toBe(false);
    expect(state.postList).toBe(true);
    expect(state.dashboard).toBe(true);
    expect(state.events).toBe(true);
    expect(state.repairList).toBe(true);
    expect(state.lostFoundList).toBe(true);
    expect(state.notifications).toBe(false);
  });

  it("refreshes lists without a post (e.g. delete)", () => {
    const { qc, invalidated } = setup();
    applyPostMutation(qc);
    const state = invalidated();
    expect(state.postList).toBe(true);
    expect(state.postDetail).toBe(false);
  });
});

describe("invalidateForEvent (SSE)", () => {
  it("post.created for a repair refreshes repair lists + dashboard only", () => {
    const { qc, invalidated } = setup();
    invalidateForEvent(qc, "post.created", { id: 100, type: "repair" });
    expect(invalidated()).toEqual({
      postDetail: false,
      otherDetail: false,
      postList: false,
      dashboard: true,
      events: false,
      repairList: true,
      lostFoundList: false,
      notifications: false,
    });
  });

  it("post.created for lost & found refreshes lost-found lists + dashboard only", () => {
    const { qc, invalidated } = setup();
    invalidateForEvent(qc, "post.created", { id: 100, type: "lost_found" });
    const state = invalidated();
    expect(state.lostFoundList).toBe(true);
    expect(state.dashboard).toBe(true);
    expect(state.postList).toBe(false);
    expect(state.repairList).toBe(false);
    expect(state.postDetail).toBe(false);
  });

  it("post.created for an announcement refreshes post lists, dashboard and events", () => {
    const { qc, invalidated } = setup();
    invalidateForEvent(qc, "post.created", { id: 100, type: "announcement" });
    const state = invalidated();
    expect(state.postList).toBe(true);
    expect(state.dashboard).toBe(true);
    expect(state.events).toBe(true);
    expect(state.repairList).toBe(false);
    expect(state.postDetail).toBe(false);
    expect(state.otherDetail).toBe(false);
  });

  it("repair.updated refreshes that repair's detail, repair lists and dashboard", () => {
    const { qc, invalidated } = setup();
    invalidateForEvent(qc, "repair.updated", { id: 42 });
    expect(invalidated()).toEqual({
      postDetail: true,
      otherDetail: false,
      postList: false,
      dashboard: true,
      events: false,
      repairList: true,
      lostFoundList: false,
      notifications: false,
    });
  });

  it("skips repair.updated only when the cached repair already has that status", () => {
    const { qc, invalidated } = setup();
    qc.setQueryData(
      queryKeys.posts.detail(42),
      makePost({ id: 42, type: "repair", repair: makeRepair("assigned") }),
    );
    invalidateForEvent(qc, "repair.updated", { id: 42, status: "assigned" });
    expect(invalidated().postDetail).toBe(false);
    expect(invalidated().repairList).toBe(false);
  });

  it("regression: a reporter who just created a repair still receives someone else's status change", () => {
    const { qc, invalidated } = setup();
    // the reporter's own create wrote the detail (status open) moments ago
    applyPostMutation(
      qc,
      makePost({ id: 42, type: "repair", repair: makeRepair("open") }),
    );
    // building staff assign a technician → status assigned, delivered via SSE right away
    invalidateForEvent(qc, "repair.updated", { id: 42, status: "assigned" });
    expect(invalidated().postDetail).toBe(true);
  });

  it("post.created is skipped only for a post this tab already holds", () => {
    const { qc, invalidated } = setup();
    invalidateForEvent(qc, "post.created", { id: 42, type: "repair" }); // 42 is cached
    expect(invalidated().repairList).toBe(false);
    invalidateForEvent(qc, "post.created", { id: 999, type: "repair" }); // someone else's
    expect(invalidated().repairList).toBe(true);
  });
});
