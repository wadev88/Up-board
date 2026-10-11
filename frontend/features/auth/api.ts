import { api } from "@/services/apiClient";
import type {
  AuthConfig,
  Faculty,
  LoginBody,
  MessageResponse,
  OnboardingBody,
  RegisterBody,
  TokenResponse,
  User,
  UserPublic,
} from "@/types/api";

/** Self-service — no admin needed. The role is never self-service. */
export interface UpdateMeBody {
  display_name?: string;
  faculty_id?: number;
  /** must belong to the faculty */
  program_id?: number;
  /** empty string clears a contact */
  contacts?: { facebook?: string; instagram?: string; line?: string };
}

export const authApi = {
  config: () => api.get<AuthConfig>("/auth/config", undefined, { auth: false }),
  register: (body: RegisterBody) =>
    api.post<MessageResponse>("/auth/register", body, { auth: false }),
  login: (body: LoginBody) => api.post<TokenResponse>("/auth/login", body, { auth: false }),
  /** ADR-003: exchange a Supabase (Google) access token for an UP Board session. `password` is
   * the registration password, only for a self-registered account that is not verified yet
   * (API: 403 PASSWORD_CONFIRMATION_REQUIRED); it is sent once and never stored. */
  exchangeSupabase: (accessToken: string, password?: string) =>
    api.post<TokenResponse>(
      "/auth/supabase",
      password === undefined ? { access_token: accessToken } : { access_token: accessToken, password },
      { auth: false },
    ),
  logout: () => api.post<void>("/auth/logout"),
  me: () => api.get<User>("/auth/me"),
  updateMe: (body: UpdateMeBody) => api.patch<User>("/auth/me", body),
  /** first sign-in only: faculty + program (both required) */
  onboarding: (body: OnboardingBody) => api.post<User>("/auth/onboarding", body),
  publicProfile: (id: number) => api.get<UserPublic>(`/users/${id}`),
  faculties: () => api.get<Faculty[]>("/faculties", undefined, { auth: false }),
};
