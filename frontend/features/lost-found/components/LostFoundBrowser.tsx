"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PackageSearch, SearchX } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { Pagination } from "@/components/common/Pagination";
import { SearchInput } from "@/components/common/SearchInput";
import { useNow } from "@/hooks/useNow";
import { useUrlSearch } from "@/hooks/useUrlSearch";
import { DEFAULT_PAGE_SIZE, LOST_FOUND_STATUS_LABELS, LOST_FOUND_STATUS_ORDER } from "@/lib/constants";
import { useLostFoundList } from "@/features/lost-found/hooks";
import { LostFoundCard } from "@/features/lost-found/components/LostFoundCard";
import type { LostFoundStatus } from "@/types/api";

/** Lost & found grid; status tab, search and page are mirrored into the URL (?status=&q=&page=). */
export function LostFoundBrowser() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const now = useNow();
  const { q, setQ, urlQ } = useUrlSearch();

  const statusParam = params.get("status");
  const status = LOST_FOUND_STATUS_ORDER.includes(statusParam as LostFoundStatus)
    ? (statusParam as LostFoundStatus)
    : undefined;
  const page = Math.max(1, Number(params.get("page")) || 1);

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

  const query = useLostFoundList({ status, q: urlQ || undefined, page, page_size: DEFAULT_PAGE_SIZE });

  const emptyTitle = urlQ
    ? "ไม่พบรายการที่ตรงกับคำค้นหา"
    : status
      ? `ยังไม่มีรายการ “${LOST_FOUND_STATUS_LABELS[status]}”`
      : "ยังไม่มีประกาศของหาย/พบของ";

  return (
    <div className="space-y-5">
      <SearchInput id="lost-found-search" label="ค้นหาของหาย/พบของ" value={q} onChange={setQ} placeholder="ค้นหาชื่อของ ลักษณะ หรือสถานที่…" />
      <Tabs value={status ?? "all"} onValueChange={(v) => setParams({ status: v === "all" ? undefined : v })}>
        <TabsList aria-label="สถานะของหาย">
          <TabsTrigger value="all">ยังตามหาอยู่</TabsTrigger>
          {LOST_FOUND_STATUS_ORDER.map((s) => (
            <TabsTrigger key={s} value={s}>
              {LOST_FOUND_STATUS_LABELS[s]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={status ?? "all"} aria-live="polite" aria-busy={query.isFetching || undefined}>
          {query.isLoading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-5" role="status" aria-label="กำลังโหลด">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] w-full rounded-2xl" />
              ))}
            </div>
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          ) : query.data && query.data.items.length === 0 ? (
            <EmptyState
              icon={urlQ ? <SearchX /> : <PackageSearch />}
              title={emptyTitle}
              description={urlQ ? "ลองเปลี่ยนคำค้นหาหรือสถานะ" : undefined}
            />
          ) : query.data ? (
            <div className="space-y-5">
              {!status && (
                <p className="text-sm text-muted-foreground">
                  ประกาศแสดง 7 วันนับจากวันที่ลง เมื่อเจ้าของกด “{LOST_FOUND_STATUS_LABELS.returned}” รายการจะออกจากหน้านี้ทันที
                  (เจ้าของยังเห็นในประวัติโพสต์)
                </p>
              )}
              <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-5 xl:grid-cols-4">
                {query.data.items.map((p) => (
                  <li key={p.id}>
                    <LostFoundCard post={p} now={now} />
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
