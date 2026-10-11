"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Flag, MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Can } from "@/features/auth/components/Guards";
import { useAuth } from "@/hooks/useAuth";
import { can } from "@/lib/permissions";
import { getErrorMessage } from "@/services/apiClient";
import { useDeletePost, useUnpinPost } from "@/features/posts/hooks";
import { PinDialog } from "@/features/posts/components/PinDialog";
import { ReportDialog } from "@/features/moderation/components/ReportDialog";
import type { Post } from "@/types/api";

/** Kebab menu: Edit / Delete / Pin / Unpin / Report, each gated by post.permissions. */
export function PostActionsMenu({ post, afterDeleteHref = "/posts" }: { post: Post; afterDeleteHref?: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const del = useDeletePost();
  const unpin = useUnpinPost(post.id);

  const canEdit = can(user, "post:update", post);
  const canDelete = can(user, "post:delete", post);
  const canPin = can(user, "post:pin", post);
  const canReport = can(user, "report:create", post);
  // a stored pin may still be scheduled (event pins start 3 days before the event)
  const hasPin = post.pinned_at !== null;
  // admins moderate: they may remove any pin, but never create one (ADR-003)
  const canModeratePin = hasPin && can(user, "report:manage");
  if (!canEdit && !canDelete && !canPin && !canReport && !canModeratePin) return null;

  const handleDelete = async () => {
    try {
      await del.mutateAsync(post.id);
      toast.success("ลบโพสต์แล้ว");
      setConfirmDelete(false);
      router.replace(afterDeleteHref);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const handleUnpin = async () => {
    try {
      await unpin.mutateAsync();
      toast.success("เลิกปักหมุดแล้ว");
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="ตัวเลือกเพิ่มเติมของโพสต์">
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <Can perm="post:update" post={post}>
            <DropdownMenuItem asChild>
              <Link href={`/posts/${post.id}/edit`}>
                <Pencil aria-hidden="true" />
                แก้ไข
              </Link>
            </DropdownMenuItem>
          </Can>
          <Can perm="post:pin" post={post}>
            {hasPin ? (
              <DropdownMenuItem onSelect={handleUnpin}>
                <PinOff aria-hidden="true" />
                เลิกปักหมุด
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => setPinOpen(true)}>
                <Pin aria-hidden="true" />
                ปักหมุด
              </DropdownMenuItem>
            )}
          </Can>
          {canModeratePin && !canPin && (
            <DropdownMenuItem onSelect={handleUnpin}>
              <PinOff aria-hidden="true" />
              ยกเลิกการปักหมุด (ผู้ดูแล)
            </DropdownMenuItem>
          )}
          <Can perm="report:create" post={post}>
            <DropdownMenuItem onSelect={() => setReportOpen(true)}>
              <Flag aria-hidden="true" />
              รายงาน
            </DropdownMenuItem>
          </Can>
          <Can perm="post:delete" post={post}>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden="true" />
              ลบโพสต์
            </DropdownMenuItem>
          </Can>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="ลบโพสต์นี้?"
        description="โพสต์จะถูกซ่อนจากทุกหน้า การลบไม่สามารถย้อนกลับได้ด้วยตัวเอง"
        confirmLabel="ลบโพสต์"
        destructive
        loading={del.isPending}
        onConfirm={handleDelete}
      />
      {canPin && <PinDialog post={post} open={pinOpen} onOpenChange={setPinOpen} />}
      {canReport && <ReportDialog postId={post.id} open={reportOpen} onOpenChange={setReportOpen} />}
    </>
  );
}
