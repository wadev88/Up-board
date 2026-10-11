"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/types/api";

interface AttachmentGalleryProps {
  attachments: Attachment[];
  title?: string;
  className?: string;
}

/** Image grid with a keyboard-operable lightbox. */
export function AttachmentGallery({ attachments, title = "รูปภาพ", className }: AttachmentGalleryProps) {
  const [open, setOpen] = useState<Attachment | null>(null);
  if (attachments.length === 0) return null;
  return (
    <section aria-label={title} className={className}>
      <ul className={cn("grid gap-2", attachments.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
        {attachments.map((a, i) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => setOpen(a)}
              className="block w-full overflow-hidden rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`ดูรูปที่ ${i + 1} ขนาดใหญ่`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- backend-served files */}
              <img
                src={a.url}
                alt={`${title} ${i + 1}`}
                loading="lazy"
                className={cn("w-full object-cover", attachments.length === 1 ? "max-h-[420px]" : "aspect-square")}
              />
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">ภาพขยาย</DialogDescription>
          {open && (
            // eslint-disable-next-line @next/next/no-img-element -- backend-served files
            <img src={open.url} alt={title} className="max-h-[80dvh] w-full rounded-lg object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
