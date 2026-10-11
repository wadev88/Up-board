import { CalendarDays, Megaphone, MessageSquare, PackageSearch, Wrench, type LucideIcon } from "lucide-react";
import type { PostType } from "@/types/api";

export interface CreateTypeOption {
  type: PostType;
  icon: LucideIcon;
  /** one-line description shown on the picker card */
  hint: string;
  /** the existing creation route for this type */
  href: string;
}

/** Order of the cards in the picker. Which of them a user sees comes from creatablePostTypes. */
export const CREATE_TYPE_OPTIONS: CreateTypeOption[] = [
  { type: "general", icon: MessageSquare, hint: "แบ่งปันเรื่องทั่วไป แสดงในฟีด 24 ชม.", href: "/posts/new?type=general" },
  { type: "repair", icon: Wrench, hint: "แจ้งจุดชำรุด ต้องมีรูปและตำแหน่ง ติดตามสถานะได้", href: "/repairs/new" },
  { type: "lost_found", icon: PackageSearch, hint: "ของหาย / พบของ แสดง 7 วัน หรือจนกว่าจะพบของแล้ว", href: "/lost-found/new" },
  { type: "announcement", icon: Megaphone, hint: "ประกาศข่าวสารจากกองอาคาร แสดงในฟีด 7 วัน", href: "/posts/new?type=announcement" },
  { type: "event", icon: CalendarDays, hint: "มีวันเวลาเริ่ม–สิ้นสุด แสดงจนจบงาน", href: "/posts/new?type=event" },
];

export function createHref(type: PostType): string {
  return CREATE_TYPE_OPTIONS.find((o) => o.type === type)?.href ?? "/posts/new";
}
