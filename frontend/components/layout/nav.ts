import {
  Bell,
  BarChart3,
  CalendarDays,
  FileText,
  GraduationCap,
  Flag,
  History,
  Home,
  PackageSearch,
  User as UserIcon,
  Users,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** match nested routes too */
  prefix?: boolean;
}

/** Primary navigation: Home · Community · Repairs · Lost & Found · Calendar. */
export const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "หน้าแรก", icon: Home },
  { href: "/posts", label: "ชุมชน", icon: UsersRound, prefix: true },
  { href: "/repairs", label: "แจ้งซ่อม", icon: Wrench, prefix: true },
  { href: "/lost-found", label: "ของหาย & พบของ", icon: PackageSearch, prefix: true },
  { href: "/calendar", label: "ปฏิทิน", icon: CalendarDays, prefix: true },
];

/** Mobile bottom navigation — exactly 5 tabs. */
export const BOTTOM_NAV: NavItem[] = [
  { href: "/dashboard", label: "หน้าแรก", icon: Home },
  { href: "/posts", label: "ชุมชน", icon: UsersRound, prefix: true },
  { href: "/repairs", label: "แจ้งซ่อม", icon: Wrench, prefix: true },
  { href: "/lost-found", label: "ของหาย", icon: PackageSearch, prefix: true },
  { href: "/profile", label: "ฉัน", icon: UserIcon, prefix: true },
];

/** Account links shown in the avatar menu and the mobile menu. */
export const ACCOUNT_NAV: NavItem[] = [
  { href: "/profile", label: "โปรไฟล์ของฉัน", icon: UserIcon },
  { href: "/profile#history", label: "ประวัติโพสต์", icon: History },
  { href: "/reports", label: "รายงานของฉัน", icon: FileText, prefix: true },
  { href: "/notifications", label: "การแจ้งเตือน", icon: Bell },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "ภาพรวมระบบ", icon: BarChart3 },
  { href: "/admin/users", label: "จัดการผู้ใช้", icon: Users, prefix: true },
  { href: "/admin/reports", label: "รายงานเนื้อหา", icon: Flag, prefix: true },
  { href: "/admin/catalog", label: "คณะและสาขาวิชา", icon: GraduationCap, prefix: true },
];

export function isActive(pathname: string, item: NavItem): boolean {
  const path = item.href.split(/[?#]/)[0];
  if (pathname === path) return true;
  return !!item.prefix && pathname.startsWith(`${path}/`);
}
