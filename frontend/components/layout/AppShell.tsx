"use client";

import * as React from "react";
import { toast } from "sonner";
import { useSSE } from "@/hooks/useSSE";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { CreatePostFab } from "@/components/layout/CreatePostFab";
import { AccountNotices } from "@/features/auth/components/AccountNotices";

export function AppShell({ children }: { children: React.ReactNode }) {
  useSSE({
    onNotification: (n) => toast(n.title, { description: n.body ?? undefined }),
  });

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-6 focus:outline-none lg:px-8 lg:pb-12"
      >
        <AccountNotices />
        {children}
      </main>
      <CreatePostFab />
      <BottomNav />
    </div>
  );
}
