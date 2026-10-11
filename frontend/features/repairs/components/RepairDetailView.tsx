"use client";

import { useState } from "react";
import { HardHat, MapPin, Navigation, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Can } from "@/features/auth/components/Guards";
import { formatDateTime } from "@/lib/format";
import { PostDetail } from "@/features/posts/components/PostDetail";
import { StatusTimeline } from "@/features/repairs/components/StatusTimeline";
import { RepairActions, useRepairActions } from "@/features/repairs/components/RepairActions";
import { AssignTechnicianDialog } from "@/features/repairs/components/AssignTechnicianDialog";
import { RepairPriorityControl } from "@/features/repairs/components/RepairPriorityControl";
import type { Post } from "@/types/api";

export function RepairDetailView({ post }: { post: Post }) {
  const [assignOpen, setAssignOpen] = useState(false);
  const repair = post.repair;
  const actions = useRepairActions(post);
  const canAssign = actions.includes("assign");
  if (!repair) return <PostDetail post={post} backHref="/repairs" backLabel="งานแจ้งซ่อม" />;

  const meta = (
    <dl className="grid gap-3 rounded-xl border border-border bg-subtle p-4 text-sm sm:grid-cols-2">
      <div className="flex gap-3">
        <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <dt className="text-xs text-muted-foreground">ตำแหน่ง</dt>
          <dd className="font-medium">{repair.location}</dd>
        </div>
      </div>
      {repair.latitude !== null && repair.longitude !== null && (
        <div className="flex gap-3">
          <Navigation className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <dt className="text-xs text-muted-foreground">พิกัด GPS</dt>
            <dd className="font-medium tabular-nums">
              {repair.latitude.toFixed(6)}, {repair.longitude.toFixed(6)}
            </dd>
          </div>
        </div>
      )}
      <div className="flex gap-3">
        <HardHat className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <dt className="text-xs text-muted-foreground">ช่างผู้รับผิดชอบ</dt>
          <dd className="font-medium">
            {repair.technician?.display_name ?? (repair.is_assigned ? "มอบหมายแล้ว" : "ยังไม่ได้มอบหมาย")}
          </dd>
        </div>
      </div>
      <div className="flex gap-3">
        <span className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div>
          <dt className="text-xs text-muted-foreground">อัปเดตล่าสุด</dt>
          <dd className="font-medium">{formatDateTime(repair.updated_at)}</dd>
        </div>
      </div>
    </dl>
  );

  return (
    <PostDetail post={post} backHref="/repairs" backLabel="งานแจ้งซ่อม" meta={meta}>
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle as="h2">ความคืบหน้า</CardTitle>
          {canAssign && (
            <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
              <UserPlus aria-hidden="true" />
              {repair.is_assigned ? "เปลี่ยนช่าง" : "มอบหมายช่าง"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="grid gap-6">
          <Can perm="repair:set_priority" post={post}>
            <div className="max-w-xs">
              <RepairPriorityControl post={post} />
            </div>
          </Can>
          <StatusTimeline history={repair.history} />
        </CardContent>
      </Card>

      {(actions.length > 0 || post.permissions.can_update_status) && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">ดำเนินการ</CardTitle>
          </CardHeader>
          <CardContent>
            {/* re-key on status so a refreshed post resets the panel */}
            <RepairActions key={repair.status} post={post} />
          </CardContent>
        </Card>
      )}

      {canAssign && <AssignTechnicianDialog post={post} open={assignOpen} onOpenChange={setAssignOpen} />}
    </PostDetail>
  );
}
