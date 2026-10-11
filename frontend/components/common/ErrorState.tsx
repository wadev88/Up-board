"use client";

import * as React from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/services/apiClient";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  error?: unknown;
  description?: React.ReactNode;
  onRetry?: () => void;
  className?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function ErrorState({
  title = "โหลดข้อมูลไม่สำเร็จ",
  error,
  description,
  onRetry,
  className,
  icon,
  action,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-border px-6 py-12 text-center",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400 [&_svg]:size-5" aria-hidden="true">
        {icon ?? <AlertTriangle />}
      </div>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">
          {description ?? (error !== undefined ? getErrorMessage(error) : null)}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          <RotateCw aria-hidden="true" />
          ลองอีกครั้ง
        </Button>
      )}
      {action}
    </div>
  );
}
