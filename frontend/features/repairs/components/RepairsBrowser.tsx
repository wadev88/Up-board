"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchX, Wrench } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { Pagination } from "@/components/common/Pagination";
import { SearchInput } from "@/components/common/SearchInput";
import { useAuth } from "@/hooks/useAuth";
import { useNow } from "@/hooks/useNow";
import { useUrlSearch } from "@/hooks/useUrlSearch";
import { DEFAULT_PAGE_SIZE, REPAIR_STATUS_FILTER_ORDER, REPAIR_STATUS_LABELS } from "@/lib/constants";
import { isTechnician } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useRepairs } from "@/features/repairs/hooks";
import { POST_GRID, PostCard, PostListSkeleton } from "@/features/posts/components/PostCard";
import type { RepairStatus } from "@/types/api";

const toggle =
  "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-8 md:px-3";

export function RepairsBrowser() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { user } = useAuth();
  const now = useNow();
  const { q, setQ, urlQ } = useUrlSearch();

  const statusParam = params.get("status");
  const status = REPAIR_STATUS_FILTER_ORDER.includes(statusParam as RepairStatus) ? (statusParam as RepairStatus) : undefined;
  const mine = params.get("mine") === "true";
  const assigned = params.get("assigned_to_me") === "true";
  const page = Math.max(1, Number(params.get("page")) || 1);
  // only technicians have jobs assigned to them (ADR-003)
  const showAssigned = isTechnician(user);

  const setParams = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    if (patch.page) next.set("page", patch.page);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const query = useRepairs({
    q: urlQ || undefined,
    status,
    mine: mine || undefined,
    assigned_to_me: assigned || undefined,
    page,
    page_size: DEFAULT_PAGE_SIZE,
  });

  return (
    <div className="space-y-5">
      <SearchInput id="repairs-search" label="ค้นหางานแจ้งซ่อม" value={q} onChange={setQ} placeholder="ค้นหาหัวข้อ รายละเอียด หรือตำแหน่ง…" />
      <Tabs value={status ?? "all"} onValueChange={(v) => setParams({ status: v === "all" ? undefined : v })}>
        <TabsList aria-label="สถานะงานซ่อม" className="w-full justify-start sm:w-auto">
          <TabsTrigger value="all">ยังไม่เสร็จ</TabsTrigger>
          {REPAIR_STATUS_FILTER_ORDER.map((s) => (
            <TabsTrigger key={s} value={s}>
              {REPAIR_STATUS_LABELS[s]}
            </TabsTrigger>
          ))}
        </TabsList>

      <div className="flex flex-wrap gap-x-2 gap-y-2" role="group" aria-label="ตัวกรองเพิ่มเติม">
        <button
          type="button"
          aria-pressed={mine}
          onClick={() => setParams({ mine: mine ? undefined : "true" })}
          className={cn(toggle, mine ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground")}
        >
          ที่ฉันแจ้ง
        </button>
        {showAssigned && (
          <button
            type="button"
            aria-pressed={assigned}
            onClick={() => setParams({ assigned_to_me: assigned ? undefined : "true" })}
            className={cn(toggle, assigned ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground")}
          >
            มอบหมายให้ฉัน
          </button>
        )}
      </div>

      <TabsContent value={status ?? "all"} aria-live="polite" aria-busy={query.isFetching || undefined}>
        {query.isLoading ? (
          <PostListSkeleton count={4} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : query.data && query.data.items.length === 0 ? (
          urlQ ? (
            <EmptyState icon={<SearchX />} title="ไม่พบงานแจ้งซ่อมที่ตรงกับคำค้นหา" description="ลองเปลี่ยนคำค้นหาหรือสถานะ" />
          ) : (
            <EmptyState icon={<Wrench />} title="ไม่มีงานแจ้งซ่อมในรายการนี้" description="พบจุดชำรุด? แจ้งซ่อมเพื่อช่วยให้มหาวิทยาลัยปลอดภัยขึ้น" />
          )
        ) : query.data ? (
          <div className="space-y-5">
            {!status && !mine && !assigned && (
              <p className="text-sm text-muted-foreground">
                งานที่ปิดแล้วหรือถูกปฏิเสธจะย้ายไปแท็บ “{REPAIR_STATUS_LABELS.closed}” / “{REPAIR_STATUS_LABELS.rejected}” และยังอยู่ในประวัติของผู้แจ้ง
              </p>
            )}
            <ul className={POST_GRID}>
              {query.data.items.map((p) => (
                <li key={p.id}>
                  <PostCard post={p} now={now} headingLevel="h2" showActions />
                </li>
              ))}
            </ul>
            <Pagination
              page={query.data.page}
              pageSize={query.data.page_size}
              total={query.data.total}
              onPageChange={(p) => setParams({ page: p > 1 ? String(p) : undefined })}
            />
          </div>
        ) : null}
      </TabsContent>
      </Tabs>
    </div>
  );
}
