"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RoleGuard } from "@/features/auth/components/Guards";
import { ADMIN_NAV, isActive } from "@/components/layout/nav";
import { cn } from "@/lib/utils";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <RoleGuard roles={["admin"]}>
      <div className="mx-auto max-w-[1100px] space-y-6">
        <nav aria-label="เมนูผู้ดูแลระบบ" className="-mx-4 overflow-x-auto px-4 lg:hidden">
          <ul className="flex gap-2">
            {ADMIN_NAV.map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 text-sm font-medium",
                      active ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {children}
      </div>
    </RoleGuard>
  );
}
