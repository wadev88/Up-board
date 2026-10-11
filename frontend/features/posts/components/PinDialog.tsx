"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DEFAULT_PIN_HOURS, PIN_HOUR_OPTIONS, PINNED_DISPLAY_LIMIT } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/services/apiClient";
import { usePinPost } from "@/features/posts/hooks";
import type { Post } from "@/types/api";

interface PinDialogProps {
  post: Pick<Post, "id" | "type" | "event" | "related_repair_id">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Pin an event or announcement for 6 / 12 / 24 / 48 / 72 hours (default 48). The server caps an
 * event pin at its start time. An announcement tied to a repair stays pinned until that repair
 * is closed or rejected, so no duration is asked for.
 */
export function PinDialog({ post, open, onOpenChange }: PinDialogProps) {
  const pin = usePinPost(post.id);
  const [hours, setHours] = useState<number>(DEFAULT_PIN_HOURS);
  const isEvent = post.type === "event";
  const followsRepair = post.type === "announcement" && post.related_repair_id !== null;

  const confirm = async () => {
    try {
      const saved = await pin.mutateAsync(followsRepair ? undefined : hours);
      toast.success(
        saved.pinned_until ? `ปักหมุดแล้ว จนถึง ${formatDateTime(saved.pinned_until)}` : "ปักหมุดแล้ว",
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ปักหมุดโพสต์</DialogTitle>
          <DialogDescription>
            {followsRepair
              ? "ประกาศนี้ผูกกับงานซ่อม จะปักหมุดจนกว่างานซ่อมนั้นจะปิดงานหรือถูกปฏิเสธ"
              : isEvent
                ? "เลือกระยะเวลาปักหมุด ระบบจะหยุดปักหมุดเมื่อกิจกรรมเริ่ม (ปักหมุดหลังเริ่มกิจกรรมไม่ได้)"
                : "เลือกระยะเวลาที่โพสต์จะแสดงในส่วน “ปักหมุด”"}
          </DialogDescription>
        </DialogHeader>
        {!followsRepair && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">ระยะเวลาปักหมุด</legend>
            <div role="radiogroup" aria-label="ระยะเวลาปักหมุด" className="flex flex-wrap gap-2">
              {PIN_HOUR_OPTIONS.map((h) => (
                <button
                  key={h}
                  type="button"
                  role="radio"
                  aria-checked={hours === h}
                  onClick={() => setHours(h)}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    hours === h
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {h} ชม.
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>ปักหมุดได้หลายโพสต์พร้อมกัน</li>
          <li>หน้าแรกแสดงโพสต์ปักหมุดได้สูงสุด {PINNED_DISPLAY_LIMIT} โพสต์ หากมีมากกว่านั้นระบบจะหมุนเวียนแสดง</li>
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button type="button" onClick={confirm} loading={pin.isPending}>
            ปักหมุด
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
