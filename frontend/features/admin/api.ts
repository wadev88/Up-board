import { api } from "@/services/apiClient";
import type {
  AdminCreateUserBody,
  AdminFacultyBody,
  AdminFacultyUpdateBody,
  AdminProgramBody,
  AdminProgramUpdateBody,
  AdminStats,
  AdminUpdateUserBody,
  Faculty,
  Page,
  Program,
  Role,
  User,
} from "@/types/api";

export interface AdminUserListParams {
  role?: Role;
  q?: string;
  /** true: only accounts with an active posting suspension */
  suspended?: boolean;
  page?: number;
  page_size?: number;
}

export const adminApi = {
  stats: () => api.get<AdminStats>("/admin/stats"),
  users: (params: AdminUserListParams = {}) => api.get<Page<User>>("/admin/users", { ...params }),
  /** pre-register a dedicated account; its owner signs in with Google (no password) */
  createUser: (body: AdminCreateUserBody) => api.post<User>("/admin/users", body),
  updateUser: (id: number, body: AdminUpdateUserBody) =>
    api.patch<User>(`/admin/users/${id}`, body),
  /** soft delete (204): the account is disabled and anonymised, its posts stay as history */
  deleteUser: (id: number) => api.delete(`/admin/users/${id}`),
  /** every faculty (inactive too) with all of its programs */
  faculties: () => api.get<Faculty[]>("/admin/faculties"),
  createFaculty: (body: AdminFacultyBody) => api.post<Faculty>("/admin/faculties", body),
  updateFaculty: (id: number, body: AdminFacultyUpdateBody) => api.patch<Faculty>(`/admin/faculties/${id}`, body),
  createProgram: (body: AdminProgramBody) => api.post<Program>("/admin/programs", body),
  updateProgram: (id: number, body: AdminProgramUpdateBody) => api.patch<Program>(`/admin/programs/${id}`, body),
};
