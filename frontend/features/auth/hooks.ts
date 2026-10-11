"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { authApi, type UpdateMeBody } from "@/features/auth/api";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/hooks/useAuth";
import type { OnboardingBody, RegisterBody } from "@/types/api";

export function useAuthConfig() {
  return useQuery({
    queryKey: ["auth", "config"],
    queryFn: authApi.config,
    staleTime: 10 * 60 * 1000,
  });
}

export function useFaculties() {
  return useQuery({
    queryKey: queryKeys.faculties,
    queryFn: authApi.faculties,
    staleTime: 60 * 60 * 1000,
  });
}

export function usePublicProfile(id: number) {
  return useQuery({
    queryKey: queryKeys.users.detail(id),
    queryFn: () => authApi.publicProfile(id),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useRegister() {
  return useMutation({ mutationFn: (body: RegisterBody) => authApi.register(body) });
}

export function useCompleteOnboarding() {
  const { setUser } = useAuth();
  return useMutation({
    mutationFn: (body: OnboardingBody) => authApi.onboarding(body),
    onSuccess: (user) => setUser(user),
  });
}

export function useUpdateProfile() {
  const { setUser } = useAuth();
  return useMutation({
    mutationFn: (body: UpdateMeBody) => authApi.updateMe(body),
    onSuccess: (user) => setUser(user),
  });
}
