"use client";

import { createContext } from "react";
import type { LoginBody, TokenResponse, User } from "@/types/api";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  login: (body: LoginBody) => Promise<User>;
  /** Start a session from tokens obtained elsewhere (Google sign-in exchange). */
  signInWithTokens: (res: TokenResponse) => User;
  logout: () => Promise<void>;
  /** Replace the cached user (e.g. after PATCH /auth/me). */
  setUser: (user: User) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
