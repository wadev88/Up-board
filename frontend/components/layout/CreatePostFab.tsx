"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { creatablePostTypes } from "@/lib/permissions";
import { PostTypePicker } from "@/features/posts/components/PostTypePicker";

/** Create forms, and the repairs / lost & found areas (they have their own create button). */
const HIDDEN_ON = ["/posts/new", "/repairs", "/lost-found"];

/**
 * Floating action button (bottom-right). Pressing it opens the post type popup straight away;
 * choosing a type goes to that type's creation form. It sits above the mobile bottom navigation
 * and only shows when the user may create at least one post type.
 */
export function CreatePostFab() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (creatablePostTypes(user).length === 0) return null;
  if (HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="สร้างโพสต์"
        aria-haspopup="dialog"
        data-testid="create-post-fab"
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 inline-flex h-14 items-center justify-center gap-2 rounded-full bg-primary px-4 text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-5 lg:bottom-8 lg:right-8"
      >
        <Plus className="size-6" aria-hidden="true" />
        <span className="hidden text-sm font-semibold sm:inline">สร้างโพสต์</span>
      </button>
      <PostTypePicker open={open} onOpenChange={setOpen} />
    </>
  );
}
