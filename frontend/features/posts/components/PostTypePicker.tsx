"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { POST_TYPE_LABELS, POST_TYPE_STYLES } from "@/lib/constants";
import { creatablePostTypes } from "@/lib/permissions";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CREATE_TYPE_OPTIONS } from "@/features/posts/createTypes";
import type { PostType } from "@/types/api";

interface PostTypePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** called after a type was chosen (before navigating) */
  onChosen?: (type: PostType) => void;
}

/**
 * Post type popup. Shows only the post types the signed-in role may create (the API enforces the
 * same matrix) and sends the user to that type's creation route. A modal dialog: focus is
 * trapped, Esc closes, and on phones it docks to the bottom like a sheet.
 */
export function PostTypePicker({ open, onOpenChange, onChosen }: PostTypePickerProps) {
  const router = useRouter();
  const { user } = useAuth();
  const allowed = creatablePostTypes(user);
  const options = CREATE_TYPE_OPTIONS.filter((o) => allowed.includes(o.type));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="post-type-picker"
        className="bottom-0 top-auto max-w-none translate-y-0 rounded-b-none pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:bottom-auto sm:top-1/2 sm:max-w-lg sm:-translate-y-1/2 sm:rounded-b-xl sm:pb-6"
      >
        <DialogHeader>
          <DialogTitle>สร้างโพสต์</DialogTitle>
          <DialogDescription>เลือกประเภทโพสต์ที่ต้องการสร้าง</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-2" aria-label="ประเภทโพสต์">
          {options.map(({ type, icon: Icon, hint, href }) => (
            <li key={type}>
              <button
                type="button"
                data-testid={`post-type-${type}`}
                onClick={() => {
                  onChosen?.(type);
                  onOpenChange(false);
                  router.push(href);
                }}
                className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-border/70 bg-card p-3 text-left shadow-card transition-[border-color,box-shadow] hover:border-primary hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-xl", POST_TYPE_STYLES[type])}>
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{POST_TYPE_LABELS[type]}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
