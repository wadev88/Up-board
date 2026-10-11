"use client";

import { Toaster as SonnerToaster, toast } from "sonner";

/** Toast host. Sonner renders an aria-live region for announcements. */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      richColors
      closeButton
      theme="system"
      containerAriaLabel="การแจ้งเตือน"
      toastOptions={{ className: "font-sans" }}
    />
  );
}

export { toast };
