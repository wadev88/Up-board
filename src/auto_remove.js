const HOUR = 60 * 60 * 1000;
const POST_LIFETIME = 24 * HOUR;
const EXPIRING_WINDOW = 3 * HOUR;

function getExpiresAt(post) {
  return new Date(post.createdAt.getTime() + POST_LIFETIME);
}

function getPostStatus(post, now = new Date()) {
  if (post.status === "hidden" || post.status === "expired") return "hidden";

  const timeLeft = getExpiresAt(post).getTime() - now.getTime();
  if (timeLeft <= 0) return "expired";
  if (timeLeft <= EXPIRING_WINDOW) return "expiring";
  return "active";
}

module.exports = { getExpiresAt, getPostStatus };