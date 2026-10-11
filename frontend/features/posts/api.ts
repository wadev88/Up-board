import { api } from "@/services/apiClient";
import type {
  Category,
  CreatePostBody,
  HistoryState,
  Page,
  Post,
  PostType,
  UpdatePostBody,
} from "@/types/api";

export interface PostListParams {
  type?: PostType;
  /** category slug */
  category?: string;
  faculty_id?: number;
  q?: string;
  page?: number;
  page_size?: number;
}

/** GET /me/posts — the caller's Post History (expired and archived posts included). */
export interface HistoryParams {
  type?: PostType;
  state?: HistoryState;
  q?: string;
  page?: number;
  page_size?: number;
}

export const postsApi = {
  list: (params: PostListParams = {}) => api.get<Page<Post>>("/posts", { ...params }),
  history: (params: HistoryParams = {}) => api.get<Page<Post>>("/me/posts", { ...params }),
  get: (id: number) => api.get<Post>(`/posts/${id}`),
  create: (body: CreatePostBody) => api.post<Post>("/posts", body),
  update: (id: number, body: UpdatePostBody) => api.patch<Post>(`/posts/${id}`, body),
  remove: (id: number) => api.delete(`/posts/${id}`),
  /** events / announcements only; hours 6|12|24|48|72 (default 48), capped at the event start by the server */
  pin: (id: number, hours?: number) => api.post<Post>(`/posts/${id}/pin`, hours ? { hours } : undefined),
  unpin: (id: number) => api.delete<Post>(`/posts/${id}/pin`),
  categories: () => api.get<Category[]>("/categories"),
};
