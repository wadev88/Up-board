import { REPAIR_STATUS_DOT_STYLES, REPAIR_STATUS_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RepairHistoryItem } from "@/types/api";

/** Vertical timeline built from repair.history (oldest → newest). */
export function StatusTimeline({ history }: { history: RepairHistoryItem[] }) {
  if (history.length === 0) {
    return <p className="text-sm text-muted-foreground">ยังไม่มีประวัติการเปลี่ยนสถานะ</p>;
  }
  const items = [...history].sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime());
  return (
    <ol className="relative space-y-5 border-l border-border pl-6" aria-label="ประวัติสถานะงานซ่อม">
      {items.map((h, i) => (
        <li key={`${h.changed_at}-${i}`} className="relative">
          <span
            className={cn("absolute -left-[31px] top-1.5 size-3 rounded-full ring-4 ring-background", REPAIR_STATUS_DOT_STYLES[h.to_status])}
            aria-hidden="true"
          />
          <p className="text-sm font-medium">
            {h.from_status ? (
              <>
                {REPAIR_STATUS_LABELS[h.from_status]} <span aria-hidden="true">→</span>
                <span className="sr-only">เปลี่ยนเป็น</span> {REPAIR_STATUS_LABELS[h.to_status]}
              </>
            ) : (
              <>แจ้งเรื่อง · {REPAIR_STATUS_LABELS[h.to_status]}</>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            <time dateTime={h.changed_at}>{formatDateTime(h.changed_at)}</time>
            {h.changed_by && ` · โดย ${h.changed_by.display_name}`}
          </p>
          {h.note && (
            <p
              className={cn(
                "mt-1 whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
                h.to_status === "rejected" ? "bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200" : "bg-muted",
              )}
            >
              {h.to_status === "rejected" && <strong className="font-semibold">เหตุผลที่ปฏิเสธ: </strong>}
              {h.note}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
