"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";

export function Avatar({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      className={cn("relative flex size-9 shrink-0 overflow-hidden rounded-full", className)}
      {...props}
    />
  );
}

export function AvatarImage({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>) {
  return <AvatarPrimitive.Image className={cn("aspect-square size-full", className)} {...props} />;
}

export function AvatarFallback({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary",
        className,
      )}
      {...props}
    />
  );
}

/** Initials avatar for a display name. */
export function UserAvatar({ name, className }: { name: string | null | undefined; className?: string }) {
  const initial = (name ?? "U").trim().charAt(0).toUpperCase() || "U";
  return (
    <Avatar className={className}>
      <AvatarFallback aria-hidden="true">{initial}</AvatarFallback>
    </Avatar>
  );
}
