import { api } from "@/services/apiClient";
import type { DashboardResponse } from "@/types/api";

export const dashboardApi = {
  get: () => api.get<DashboardResponse>("/dashboard"),
};
