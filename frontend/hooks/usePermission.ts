"use client";

import { useAuth } from "@/hooks/useAuth";
import { can, hasRole, type Permission } from "@/lib/permissions";
import type { Post, Role } from "@/types/api";

/** UX-only permission check; prefers `post.permissions` from the backend. */
export function usePermission(perm: Permission, post?: Post | null): boolean {
  const { user } = useAuth();
  return can(user, perm, post ?? undefined);
}

export function useHasRole(roles: Role[]): boolean {
  const { user } = useAuth();
  return hasRole(user, roles);
}
