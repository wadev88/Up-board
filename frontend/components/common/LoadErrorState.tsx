"use client";

import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/common/ErrorState";
import { isApiError } from "@/services/apiClient";

interface LoadErrorStateProps {
  /** the failed query's error; `null`/`undefined` together with `notFound` for invalid ids */
  error?: unknown;
  /** force the not-found variant (e.g. the route id is not a valid id) */
  notFound?: boolean;
  notFoundTitle: string;
  errorTitle?: string;
  onRetry?: () => void;
  backHref: string;
  backLabel: string;
}

/**
 * Error / 404 state for detail-style pages: a 404 (or invalid id) shows the
 * not-found message without retry, other errors offer a retry; both link back.
 */
export function LoadErrorState({
  error,
  notFound,
  notFoundTitle,
  errorTitle = "โหลดข้อมูลไม่สำเร็จ",
  onRetry,
  backHref,
  backLabel,
}: LoadErrorStateProps) {
  const isNotFound = notFound || (isApiError(error) && error.status === 404);
  return (
    <div className="mx-auto max-w-[720px]">
      <ErrorState
        icon={isNotFound ? <FileQuestion /> : undefined}
        title={isNotFound ? notFoundTitle : errorTitle}
        error={error ?? undefined}
        description={isNotFound && !error ? "ลิงก์อาจไม่ถูกต้อง หรือข้อมูลนี้ถูกลบไปแล้ว" : undefined}
        onRetry={isNotFound ? undefined : onRetry}
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href={backHref}>
              <ArrowLeft aria-hidden="true" />
              {backLabel}
            </Link>
          </Button>
        }
      />
    </div>
  );
}
