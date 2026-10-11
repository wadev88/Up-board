import { api } from "@/services/apiClient";
import type {
  CreateRepairBody,
  Page,
  Post,
  Priority,
  RepairStatus,
  Technician,
  UpdateRepairStatusBody,
} from "@/types/api";

export interface RepairListParams {
  status?: RepairStatus;
  /** search title / content / location (max 100 chars) */
  q?: string;
  mine?: boolean;
  assigned_to_me?: boolean;
  page?: number;
  page_size?: number;
}

export const repairsApi = {
  list: (params: RepairListParams = {}) => api.get<Page<Post>>("/repairs", { ...params }),
  get: (id: number) => api.get<Post>(`/repairs/${id}`),
  create: (body: CreateRepairBody) => api.post<Post>("/repairs", body),
  updateStatus: (id: number, body: UpdateRepairStatusBody) =>
    api.patch<Post>(`/repairs/${id}`, body),
  assign: (id: number, technician_id: number) =>
    api.patch<Post>(`/repairs/${id}/assign`, { technician_id }),
  /** building staff only */
  setPriority: (id: number, priority: Priority) =>
    api.patch<Post>(`/repairs/${id}/priority`, { priority }),
  technicians: () => api.get<Technician[]>("/technicians"),
};
