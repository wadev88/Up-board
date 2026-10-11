const assert = require("node:assert/strict");
const test = require("node:test");
const { getExpiresAt, getPostStatus } = require("../auto_remove");

const createdAt = new Date("2026-08-24T12:00:00Z");

function postWithStatus(status = "active") {
  return { createdAt, status };
}

test("returns active while more than three hours remain", () => {
  const now = new Date("2026-08-25T08:59:59Z");

  assert.equal(getPostStatus(postWithStatus(), now), "active");
});

test("returns expiring at the three-hour boundary", () => {
  const now = new Date("2026-08-25T09:00:00Z");

  assert.equal(getPostStatus(postWithStatus(), now), "expiring");
});

test("returns expiring immediately before expiration", () => {
  const now = new Date("2026-08-25T11:59:59Z");

  assert.equal(getPostStatus(postWithStatus(), now), "expiring");
});

test("returns expired at the 24-hour boundary", () => {
  const now = new Date("2026-08-25T12:00:00Z");

  assert.equal(getPostStatus(postWithStatus(), now), "expired");
});

test("returns hidden for a manually hidden post", () => {
  const now = new Date("2026-08-24T13:00:00Z");

  assert.equal(getPostStatus(postWithStatus("hidden"), now), "hidden");
});

test("calculates the expiration exactly 24 hours after creation", () => {
  assert.equal(getExpiresAt(postWithStatus()).toISOString(), "2026-08-25T12:00:00.000Z");
});