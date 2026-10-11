const assert = require("node:assert/strict");

const test = require("node:test");

const { getPostStatus } = require("../auto_remove");

test("a post remains active before 21 hours", () => {
  const now = new Date("2026-08-25T10:00:00Z");
  const post = { createdAt: new Date("2026-08-24T14:00:00Z"), status: "active" };

  assert.equal(getPostStatus(post, now), "active");
});

test("a post becomes expiring during its final three hours", () => {
  const now = new Date("2026-08-25T12:00:00Z");
  const post = { createdAt: new Date("2026-08-24T13:30:00Z"), status: "active" };

  assert.equal(getPostStatus(post, now), "expiring");
});

test("a post is expired after 24 hours", () => {
  const now = new Date("2026-08-25T12:00:00Z");
  const post = { createdAt: new Date("2026-08-24T11:59:59Z"), status: "active" };

  assert.equal(getPostStatus(post, now), "expired");
});

test("a hidden post stays hidden even when it is not expired", () => {
  const now = new Date("2026-08-25T12:00:00Z");
  const post = { createdAt: new Date("2026-08-25T11:00:00Z"), status: "hidden" };

  assert.equal(getPostStatus(post, now), "hidden");
});

// เพิ่ม Test ตัวที่ 5
test("a post is expired exactly at the 24-hour boundary", () => {
  const now = new Date("2026-08-25T14:00:00Z");
  const post = {
    createdAt: new Date("2026-08-24T14:00:00Z"),
    status: "active",
  };

  assert.equal(getPostStatus(post, now), "expired");
});

// เพิ่ม Test ตัวที่ 6
test("a post becomes expiring exactly at the three-hour boundary", () => {
  const now = new Date("2026-08-25T11:00:00Z");
  const post = {
    createdAt: new Date("2026-08-24T14:00:00Z"),
    status: "active",
  };

  assert.equal(getPostStatus(post, now), "expiring");
});

// เพิ่ม Test ตัวที่ 7
test("a post created in the future is still treated as active", () => {
  const now = new Date("2026-08-25T12:00:00Z");
  const post = {
    createdAt: new Date("2026-08-25T13:00:00Z"),
    status: "active",
  };

  assert.equal(getPostStatus(post, now), "active");
});

// เพิ่ม Test ตัวที่ 8
test("a hidden post remains hidden near the expiration boundary", () => {
  const now = new Date("2026-08-25T13:00:00Z");
  const post = {
    createdAt: new Date("2026-08-24T14:00:00Z"),
    status: "hidden",
  };

  assert.equal(getPostStatus(post, now), "hidden");
});

// เพิ่ม Test ตัวที่ 9
test("throws an error when a post has no createdAt", () => {
  const now = new Date("2026-08-25T12:00:00Z");
  const post = {
    status: "active",
  };

  assert.throws(() => getPostStatus(post, now));
});