"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2, LogOut, Menu, Shield } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isAdmin } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Logo } from "@/components/layout/Logo";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { ACCOUNT_NAV, ADMIN_NAV, MAIN_NAV, isActive, type NavItem } from "@/components/layout/nav";

function MenuLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: boolean }) {
  const active = isActive(pathname, item);
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
        active ? "bg-primary-soft text-primary" : "text-foreground hover:bg-muted",
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {item.label}
    </Link>
  );
  return onNavigate ? <SheetClose asChild>{link}</SheetClose> : link;
}

/** Accessible mobile menu (Radix dialog: focus trap, Esc to close, labelled). */
function MobileMenu({ pathname }: { pathname: string }) {
  const { user } = useAuth();
  const facultyItem: NavItem | null = user?.faculty
    ? { href: `/faculty/${user.faculty.id}`, label: user.faculty.name_th, icon: Building2 }
    : null;
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="เปิดเมนู">
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 max-w-[85vw]" data-testid="mobile-menu">
        <SheetTitle className="sr-only">เมนูหลัก</SheetTitle>
        <SheetDescription className="sr-only">ไปยังหน้าต่าง ๆ ของ UP Board</SheetDescription>
        <Logo />
        <nav aria-label="เมนูหลัก (มือถือ)" className="space-y-6">
          <ul className="space-y-1">
            {MAIN_NAV.map((item) => (
              <li key={item.href}>
                <MenuLink item={item} pathname={pathname} onNavigate />
              </li>
            ))}
          </ul>
          <div>
            <p className="mb-1 px-3 text-xs font-medium text-muted-foreground">บัญชีของฉัน</p>
            <ul className="space-y-1">
              {[...ACCOUNT_NAV, ...(facultyItem ? [facultyItem] : [])].map((item) => (
                <li key={item.href}>
                  <MenuLink item={item} pathname={pathname} onNavigate />
                </li>
              ))}
            </ul>
          </div>
          {isAdmin(user) && (
            <div>
              <p className="mb-1 px-3 text-xs font-medium text-muted-foreground">ผู้ดูแลระบบ</p>
              <ul className="space-y-1">
                {ADMIN_NAV.map((item) => (
                  <li key={item.href}>
                    <MenuLink item={item} pathname={pathname} onNavigate />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Top navigation: logo left, primary links centred (current page in deep purple),
 * notifications + avatar menu right (creating a post is the floating button, see CreatePostFab). Links shown here only reflect the
 * user's role for convenience — every action is still authorised by the API.
 */
export function TopBar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/75">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 lg:px-8">
        <MobileMenu pathname={pathname} />
        <Logo />

        <nav aria-label="เมนูหลัก" className="mx-auto hidden lg:block">
          <ul className="flex items-center gap-1">
            {MAIN_NAV.map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex h-10 items-center rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-primary-soft text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1 lg:ml-0">
          <NotificationBell />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`เมนูผู้ใช้ ${user?.display_name ?? ""}`}>
                <UserAvatar name={user?.display_name} className="size-9" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>
                <span className="block truncate text-sm font-medium text-foreground">{user?.display_name}</span>
                <span className="block truncate">
                  {user ? ROLE_LABELS[user.role] : ""} · {user?.email}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ACCOUNT_NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link href={item.href}>
                      <Icon aria-hidden="true" />
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                );
              })}
              {user?.faculty && (
                <DropdownMenuItem asChild>
                  <Link href={`/faculty/${user.faculty.id}`}>
                    <Building2 aria-hidden="true" />
                    {user.faculty.name_th}
                  </Link>
                </DropdownMenuItem>
              )}
              {isAdmin(user) && (
                <DropdownMenuItem asChild>
                  <Link href="/admin">
                    <Shield aria-hidden="true" />
                    ผู้ดูแลระบบ
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleLogout} destructive>
                <LogOut aria-hidden="true" />
                ออกจากระบบ
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
