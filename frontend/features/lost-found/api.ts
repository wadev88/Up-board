import { api } from "@/services/apiClient";
import type {
  CreateLostFoundBody,
  LostFoundStatus,
  Page,
  Post,
  UpdateLostFoundBody,
} from "@/types/api";

export interface LostFoundListParams {
  /** omitted → every status */
  status?: LostFoundStatus;
  /** search title / content / location (max 100 chars) */
  q?: string;
  mine?: boolean;
  page?: number;
  page_size?: number;
}

export const lostFoundApi = {
  list: (params: LostFoundListParams = {}) => api.get<Page<Post>>("/lost-found", { ...params }),
  get: (id: number) => api.get<Post>(`/lost-found/${id}`),
  create: (body: CreateLostFoundBody) => api.post<Post>("/lost-found", body),
  update: (id: number, body: UpdateLostFoundBody) => api.patch<Post>(`/lost-found/${id}`, body),
};
