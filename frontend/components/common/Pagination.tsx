"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({ page, pageSize, total, onPageChange, className }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (total <= pageSize) return null;
  return (
    <nav aria-label="เลื่อนหน้า" className={cn("flex items-center justify-between gap-2", className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="หน้าก่อนหน้า"
      >
        <ChevronLeft aria-hidden="true" />
        <span className="hidden sm:inline">ก่อนหน้า</span>
      </Button>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        หน้า {formatNumber(page)} จาก {formatNumber(totalPages)}
        <span className="hidden sm:inline"> · ทั้งหมด {formatNumber(total)} รายการ</span>
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="หน้าถัดไป"
      >
        <span className="hidden sm:inline">ถัดไป</span>
        <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  );
}
