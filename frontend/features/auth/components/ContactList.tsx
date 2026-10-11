import { AtSign, Globe, MessageCircle, type LucideIcon } from "lucide-react";
import type { Contacts } from "@/types/api";

const CHANNELS: { key: keyof Contacts; label: string; icon: LucideIcon }[] = [
  { key: "facebook", label: "Facebook", icon: Globe },
  { key: "instagram", label: "Instagram", icon: AtSign },
  { key: "line", label: "LINE", icon: MessageCircle },
];

const isUrl = (v: string) => /^https?:\/\//i.test(v);

/** The contact channels that are filled in — empty ones are never rendered (no empty links). */
export function ContactList({ contacts }: { contacts: Partial<Contacts> | null | undefined }) {
  const items = CHANNELS.flatMap((c) => {
    const value = contacts?.[c.key]?.trim();
    return value ? [{ ...c, value }] : [];
  });
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2 text-sm" aria-label="ช่องทางติดต่อ" data-testid="contact-list">
      {items.map(({ key, label, icon: Icon, value }) => (
        <li key={key} className="flex items-center gap-2">
          <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="text-muted-foreground">{label}:</span>
          {isUrl(value) ? (
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 truncate font-medium text-primary underline-offset-4 hover:underline"
            >
              {value}
            </a>
          ) : (
            <span className="min-w-0 truncate font-medium">{value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
