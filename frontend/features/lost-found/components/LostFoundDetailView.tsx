"use client";

import { useState } from "react";
import { CalendarClock, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Can } from "@/features/auth/components/Guards";
import { LOST_FOUND_STATUS_LABELS, LOST_FOUND_STATUS_ORDER } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { getErrorMessage } from "@/services/apiClient";
import { PostDetail } from "@/features/posts/components/PostDetail";
import { useUpdateLostFound } from "@/features/lost-found/hooks";
import type { LostFoundStatus, Post } from "@/types/api";

function StatusControl({ post }: { post: Post }) {
  const current = post.lost_found!.status;
  const [value, setValue] = useState<LostFoundStatus>(current);
  const update = useUpdateLostFound(post.id);

  const save = async () => {
    try {
      await update.mutateAsync({ status: value });
      toast.success(`เปลี่ยนสถานะเป็น “${LOST_FOUND_STATUS_LABELS[value]}” แล้ว`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <FormField id="lf-status" label="สถานะ" className="flex-1">
        <Select id="lf-status" value={value} onChange={(e) => setValue(e.target.value as LostFoundStatus)}>
          {LOST_FOUND_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {LOST_FOUND_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </FormField>
      <Button onClick={save} loading={update.isPending} disabled={value === current}>
        บันทึกสถานะ
      </Button>
    </div>
  );
}

export function LostFoundDetailView({ post }: { post: Post }) {
  const lf = post.lost_found;
  const meta = lf ? (
    <dl className="grid gap-3 rounded-xl border border-border bg-subtle p-4 text-sm sm:grid-cols-2">
      <div className="flex gap-3">
        <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <dt className="text-xs text-muted-foreground">สถานที่</dt>
          <dd className="font-medium">{lf.location}</dd>
        </div>
      </div>
      {lf.occurred_at && (
        <div className="flex gap-3">
          <CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <dt className="text-xs text-muted-foreground">วันเวลาที่{lf.status === "found" ? "พบ" : "หาย"}</dt>
            <dd className="font-medium">{formatDateTime(lf.occurred_at)}</dd>
          </div>
        </div>
      )}
    </dl>
  ) : null;

  return (
    <PostDetail post={post} backHref="/lost-found" backLabel="ของหาย/พบของ" meta={meta}>
      {lf && (
        <Can perm="lost_found:update_status" post={post}>
          <Card>
            <CardHeader>
              <CardTitle as="h2">อัปเดตสถานะ</CardTitle>
            </CardHeader>
            <CardContent>
              <StatusControl post={post} />
            </CardContent>
          </Card>
        </Can>
      )}
    </PostDetail>
  );
}
