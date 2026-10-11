"use client";

import { useState } from "react";
import { Ban, Pencil, Search, UserPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { Pagination } from "@/components/common/Pagination";
import { useDebounce } from "@/hooks/useDebounce";
import { DEFAULT_PAGE_SIZE, ROLE_LABELS, ROLE_ORDER } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAdminUsers } from "@/features/admin/hooks";
import { UserEditSheet } from "@/features/admin/components/UserEditSheet";
import { UserCreateSheet } from "@/features/admin/components/UserCreateSheet";
import type { Role, User } from "@/types/api";

export function UsersTable() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<"all" | "suspended">("all");
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const debouncedQ = useDebounce(q.trim(), 350);
  const query = useAdminUsers({ q: debouncedQ || undefined, role: role || undefined, suspended: tab === "suspended" ? true : undefined, page, page_size: DEFAULT_PAGE_SIZE });

  return (
    <div>
      <PageHeader
        title="จัดการผู้ใช้"
        description="สร้างบัญชีเจ้าหน้าที่ ช่าง และสโมสรนิสิต กำหนดบทบาท คณะ สถานะบัญชี และโปรไฟล์ช่าง"
        actions={
          <Button onClick={() => setCreating(true)}>
            <UserPlus aria-hidden="true" />
            สร้างบัญชี
          </Button>
        }
      />
      <UserCreateSheet open={creating} onOpenChange={setCreating} />
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as "all" | "suspended");
          setPage(1);
        }}
        className="mb-4"
      >
        <TabsList aria-label="กรองผู้ใช้">
          <TabsTrigger value="all" aria-controls={undefined}>ทั้งหมด</TabsTrigger>
          <TabsTrigger value="suspended" aria-controls={undefined}>
            <Ban aria-hidden="true" />
            ถูกระงับ
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_200px]">
        <div className="relative" role="search">
          <label htmlFor="users-search" className="sr-only">
            ค้นหาผู้ใช้
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id="users-search"
            type="search"
            placeholder="ค้นหาชื่อหรืออีเมล…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <div>
          <label htmlFor="users-role" className="sr-only">
            กรองตามบทบาท
          </label>
          <Select
            id="users-role"
            value={role}
            onChange={(e) => {
              setRole(e.target.value as Role | "");
              setPage(1);
            }}
          >
            <option value="">ทุกบทบาท</option>
            {ROLE_ORDER.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div aria-live="polite" aria-busy={query.isFetching || undefined}>
        {query.isLoading ? (
          <div className="space-y-2" role="status" aria-label="กำลังโหลด">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : !query.data || query.data.items.length === 0 ? (
          <EmptyState icon={<Users />} title={tab === "suspended" ? "ไม่มีบัญชีที่ถูกระงับโพสต์" : "ไม่พบผู้ใช้"} />
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[720px] text-left text-sm">
                <caption className="sr-only">รายชื่อผู้ใช้</caption>
                <thead className="border-b border-border bg-subtle text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">ผู้ใช้</th>
                    <th scope="col" className="px-4 py-3 font-medium">บทบาท</th>
                    <th scope="col" className="px-4 py-3 font-medium">คณะ</th>
                    <th scope="col" className="px-4 py-3 font-medium">สถานะ</th>
                    <th scope="col" className="px-4 py-3 font-medium">สมัครเมื่อ</th>
                    <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">การจัดการ</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {query.data.items.map((u) => {
                    const suspension = u.suspension;
                    const suspendedUntil = u.posting_suspended_until ?? suspension?.ends_at ?? null;
                    const suspended = !!suspension || !!suspendedUntil;
                    return (
                    <tr
                      key={u.id}
                      className={cn("hover:bg-subtle", suspended && "bg-red-50/70 dark:bg-red-950/20")}
                      data-suspended={suspended || undefined}
                    >
                      <td className={cn("px-4 py-3", suspended && "border-l-4 border-l-red-500")}>
                        <div className="font-medium">{u.display_name}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={u.role === "admin" ? "accent" : "default"}>{ROLE_LABELS[u.role]}</Badge>
                          {u.is_technician && <Badge variant="outline">ช่าง</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {u.faculty?.name_th ?? "—"}
                        {u.program && <span className="block text-xs">{u.program.name_th}</span>}
                      </td>
                      <td className="px-4 py-3">
                        {u.is_active ? (
                          <span className="text-green-700 dark:text-green-400">ใช้งาน</span>
                        ) : (
                          <Badge variant="custom" className="bg-red-100 text-red-800 ring-red-600/30 dark:bg-red-950/60 dark:text-red-300">
                            ปิดใช้งาน
                          </Badge>
                        )}
                        {!u.is_verified && (
                          <Badge variant="outline" className="mt-1">
                            ยังไม่ยืนยัน
                          </Badge>
                        )}
                        {suspendedUntil && (
                          <div className="mt-1 space-y-0.5">
                            <Badge variant="custom" className="bg-red-100 text-red-800 ring-red-600/30 dark:bg-red-950/60 dark:text-red-300">
                              <Ban aria-hidden="true" />
                              ระงับโพสต์ · คืนสิทธิ์ {formatDateTime(suspendedUntil)}
                            </Badge>
                            {suspension && (
                              <p className="text-xs text-red-800 dark:text-red-300">
                                เริ่ม {formatDateTime(suspension.starts_at)} · วันสุดท้าย {formatDate(suspension.last_day)}
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(u.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="icon-sm" onClick={() => setEditing(u)} aria-label={`แก้ไข ${u.display_name}`}>
                          <Pencil aria-hidden="true" />
                        </Button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={query.data.page} pageSize={query.data.page_size} total={query.data.total} onPageChange={setPage} />
          </div>
        )}
      </div>
      <UserEditSheet user={editing} onOpenChange={(o) => !o && setEditing(null)} />
    </div>
  );
}
