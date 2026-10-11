import { api } from "@/services/apiClient";
import type {
  CreateReportBody,
  Page,
  Report,
  ReportStatus,
  UpdateReportBody,
} from "@/types/api";

export interface ReportListParams {
  status?: ReportStatus;
  page?: number;
  page_size?: number;
}

export const moderationApi = {
  create: (body: CreateReportBody) => api.post<Report>("/reports", body),
  list: (params: ReportListParams = {}) => api.get<Page<Report>>("/reports", { ...params }),
  /** the caller's own reports */
  mine: (params: { page?: number; page_size?: number } = {}) => api.get<Page<Report>>("/reports/mine", { ...params }),
  /** owner or admin */
  get: (id: number) => api.get<Report>(`/reports/${id}`),
  update: (id: number, body: UpdateReportBody) => api.patch<Report>(`/reports/${id}`, body),
};
