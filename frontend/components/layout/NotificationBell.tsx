"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useUnreadCount } from "@/features/notifications/hooks";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function NotificationBell({ className }: { className?: string }) {
  const { data } = useUnreadCount();
  const count = data?.count ?? 0;
  const label = count > 0 ? `การแจ้งเตือน (ยังไม่อ่าน ${count} รายการ)` : "การแจ้งเตือน";
  return (
    <Link
      href="/notifications"
      aria-label={label}
      className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative", className)}
    >
      <Bell aria-hidden="true" />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute right-1.5 top-1.5 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold leading-5 text-white"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
