import { api } from "@/services/apiClient";
import type { Post } from "@/types/api";

export interface EventRange {
  /** ISO-8601 */
  from?: string;
  /** ISO-8601 */
  to?: string;
}

export const eventsApi = {
  list: (range: EventRange = {}) => api.get<Post[]>("/events", { ...range }),
};
