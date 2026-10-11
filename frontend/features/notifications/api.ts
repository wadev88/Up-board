import { api } from "@/services/apiClient";
import type { Notification, Page, UnreadCount } from "@/types/api";

export interface NotificationListParams {
  unread_only?: boolean;
  page?: number;
  page_size?: number;
}

export const notificationsApi = {
  list: (params: NotificationListParams = {}) =>
    api.get<Page<Notification>>("/notifications", { ...params }),
  unreadCount: () => api.get<UnreadCount>("/notifications/unread-count"),
  markRead: (id: number) => api.patch<Notification>(`/notifications/${id}/read`),
  readAll: () => api.post<void>("/notifications/read-all"),
};
