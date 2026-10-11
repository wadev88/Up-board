import { CalendarDays, Flag, MapPin } from "lucide-react";
import { EVENT_PRIORITY_LABELS } from "@/lib/constants";
import { formatDateTime, formatTime } from "@/lib/format";
import type { EventInfo } from "@/types/api";

/** Event date/time, venue and priority level. */
export function EventInfoBlock({ event }: { event: EventInfo }) {
  const sameDay =
    event.ends_at &&
    new Date(event.starts_at).toDateString() === new Date(event.ends_at).toDateString();
  return (
    <dl className="grid gap-3 rounded-2xl border border-border bg-card p-4 text-sm shadow-card sm:grid-cols-2">
      <div className="flex gap-3">
        <CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <dt className="text-xs text-muted-foreground">วันเวลา</dt>
          <dd className="font-medium">
            {formatDateTime(event.starts_at)}
            {event.ends_at && ` – ${sameDay ? formatTime(event.ends_at) : formatDateTime(event.ends_at)}`}
          </dd>
        </div>
      </div>
      <div className="flex gap-3">
        <Flag className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <dt className="text-xs text-muted-foreground">ระดับกิจกรรม</dt>
          <dd className="font-medium">{EVENT_PRIORITY_LABELS[event.priority_level]}</dd>
        </div>
      </div>
      {event.venue && (
        <div className="flex gap-3">
          <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <dt className="text-xs text-muted-foreground">สถานที่</dt>
            <dd className="font-medium">{event.venue}</dd>
          </div>
        </div>
      )}
    </dl>
  );
}
