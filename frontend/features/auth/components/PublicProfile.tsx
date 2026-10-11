"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadErrorState } from "@/components/common/LoadErrorState";
import { ROLE_LABELS } from "@/lib/constants";
import { parsePositiveId } from "@/lib/utils";
import { usePublicProfile } from "@/features/auth/hooks";
import { ContactList } from "@/features/auth/components/ContactList";

const BACK = { backHref: "/dashboard", backLabel: "หน้าแรก" };

/** /users/[id] — what any signed-in user may see about another user (only filled-in contacts). */
export function PublicProfile() {
  const { id } = useParams<{ id: string }>();
  const userId = parsePositiveId(id);
  const q = usePublicProfile(userId ?? 0);

  if (userId === null) return <LoadErrorState notFound notFoundTitle="ไม่พบผู้ใช้นี้" {...BACK} />;
  if (q.isLoading) {
    return (
      <div className="mx-auto max-w-[720px] space-y-4" role="status" aria-label="กำลังโหลด">
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <LoadErrorState
        error={q.error}
        notFoundTitle="ไม่พบผู้ใช้นี้"
        errorTitle="โหลดโปรไฟล์ไม่สำเร็จ"
        onRetry={() => q.refetch()}
        {...BACK}
      />
    );
  }
  const u = q.data;
  const hasContacts = Object.values(u.contacts ?? {}).some((v) => !!v && v.trim());
  return (
    <div className="mx-auto max-w-[720px]">
      <h1 className="sr-only">โปรไฟล์ของ {u.display_name}</h1>
      <Card className="overflow-hidden">
        <div className="h-20 bg-linear-to-r from-primary-soft to-secondary-soft" aria-hidden="true" />
        <CardContent className="-mt-10 space-y-4 p-5">
          <div className="flex items-end gap-4">
            <UserAvatar name={u.display_name} className="size-20 border-4 border-card text-2xl" />
            <div className="min-w-0 flex-1 pb-1">
              <p className="truncate text-xl font-semibold" data-testid="public-profile-name">
                {u.display_name}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="accent">{ROLE_LABELS[u.role]}</Badge>
            {u.faculty && (
              <Link href={`/faculty/${u.faculty.id}`}>
                <Badge variant="outline">
                  <Building2 aria-hidden="true" />
                  {u.faculty.name_th}
                </Badge>
              </Link>
            )}
            {u.program && <Badge variant="outline">{u.program.name_th}</Badge>}
          </div>
          {hasContacts ? (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold">ช่องทางติดต่อ</h2>
              <ContactList contacts={u.contacts} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">ผู้ใช้นี้ยังไม่ได้ระบุช่องทางติดต่อ</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
