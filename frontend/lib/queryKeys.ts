/** Central TanStack Query keys so SSE / mutations can invalidate consistently. */
export const queryKeys = {
  me: ["auth", "me"] as const,
  faculties: ["faculties"] as const,
  users: {
    detail: (id: number) => ["users", id] as const,
  },
  categories: ["categories"] as const,
  dashboard: ["dashboard"] as const,
  posts: {
    all: ["posts"] as const,
    /** prefix of every post list (not details) */
    lists: ["posts", "list"] as const,
    list: (params: object) => ["posts", "list", params] as const,
    /** details of every post type (general, announcement, repair, lost & found) */
    detail: (id: number) => ["posts", "detail", id] as const,
  },
  eventsAll: ["events"] as const,
  events: (params: object) => ["events", params] as const,
  repairs: {
    all: ["repairs"] as const,
    lists: ["repairs", "list"] as const,
    list: (params: object) => ["repairs", "list", params] as const,
  },
  technicians: ["technicians"] as const,
  lostFound: {
    all: ["lost-found"] as const,
    lists: ["lost-found", "list"] as const,
    list: (params: object) => ["lost-found", "list", params] as const,
  },
  notifications: {
    all: ["notifications"] as const,
    list: (params: object) => ["notifications", "list", params] as const,
    unreadCount: ["notifications", "unread-count"] as const,
  },
  reports: {
    all: ["reports"] as const,
    list: (params: object) => ["reports", "list", params] as const,
    mine: (params: object) => ["reports", "mine", params] as const,
    detail: (id: number) => ["reports", "detail", id] as const,
  },
  admin: {
    stats: ["admin", "stats"] as const,
    users: (params: object) => ["admin", "users", params] as const,
    usersAll: ["admin", "users"] as const,
    catalog: ["admin", "catalog"] as const,
  },
};
