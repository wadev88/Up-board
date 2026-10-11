"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, type AdminUserListParams } from "@/features/admin/api";
import { queryKeys } from "@/lib/queryKeys";
import type {
  AdminCreateUserBody,
  AdminFacultyBody,
  AdminFacultyUpdateBody,
  AdminProgramBody,
  AdminProgramUpdateBody,
  AdminUpdateUserBody,
} from "@/types/api";

export function useAdminStats() {
  return useQuery({ queryKey: queryKeys.admin.stats, queryFn: adminApi.stats });
}

export function useAdminUsers(params: AdminUserListParams) {
  return useQuery({
    queryKey: queryKeys.admin.users(params),
    queryFn: () => adminApi.users(params),
    placeholderData: keepPreviousData,
  });
}

export function useAdminCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AdminCreateUserBody) => adminApi.createUser(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.admin.usersAll });
      void qc.invalidateQueries({ queryKey: queryKeys.admin.stats });
      void qc.invalidateQueries({ queryKey: queryKeys.technicians });
    },
  });
}

export function useAdminUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: AdminUpdateUserBody }) => adminApi.updateUser(id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.admin.usersAll });
      void qc.invalidateQueries({ queryKey: queryKeys.admin.stats });
      void qc.invalidateQueries({ queryKey: queryKeys.technicians });
    },
  });
}

export function useAdminDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => adminApi.deleteUser(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.admin.usersAll });
      void qc.invalidateQueries({ queryKey: queryKeys.admin.stats });
      void qc.invalidateQueries({ queryKey: queryKeys.technicians });
    },
  });
}

export function useAdminFaculties() {
  return useQuery({ queryKey: queryKeys.admin.catalog, queryFn: adminApi.faculties });
}

/**
 * Faculties an admin can assign to a user: the admin catalog (includes the admin-only unit),
 * active ones plus the faculty the edited user already has, with active programs only.
 */
export function useAssignableFaculties(currentFacultyId?: number | null) {
  return useQuery({
    queryKey: queryKeys.admin.catalog,
    queryFn: adminApi.faculties,
    select: (all) =>
      all
        .filter((f) => f.is_active || f.id === currentFacultyId)
        .map((f) => ({ ...f, programs: (f.programs ?? []).filter((p) => p.is_active) })),
  });
}

/** Catalog changes also refresh the public faculty list used by onboarding / profile forms. */
function useCatalogInvalidation() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: queryKeys.admin.catalog });
    void qc.invalidateQueries({ queryKey: queryKeys.faculties });
  };
}

export function useCreateFaculty() {
  const done = useCatalogInvalidation();
  return useMutation({ mutationFn: (body: AdminFacultyBody) => adminApi.createFaculty(body), onSuccess: done });
}

export function useUpdateFaculty() {
  const done = useCatalogInvalidation();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: AdminFacultyUpdateBody }) => adminApi.updateFaculty(id, body),
    onSuccess: done,
  });
}

export function useCreateProgram() {
  const done = useCatalogInvalidation();
  return useMutation({ mutationFn: (body: AdminProgramBody) => adminApi.createProgram(body), onSuccess: done });
}

export function useUpdateProgram() {
  const done = useCatalogInvalidation();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: AdminProgramUpdateBody }) => adminApi.updateProgram(id, body),
    onSuccess: done,
  });
}
