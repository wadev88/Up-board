"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BOTTOM_NAV, isActive } from "@/components/layout/nav";
import { cn } from "@/lib/utils";

/** Mobile bottom navigation (hidden ≥1024px). 5 tabs, ≥48px touch targets. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="เมนูด้านล่าง"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_3px_rgb(16_24_40/0.06)] backdrop-blur lg:hidden"
      data-testid="bottom-nav"
    >
      <ul className="grid grid-cols-5">
        {BOTTOM_NAV.map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
