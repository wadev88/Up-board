"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchX } from "lucide-react";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { Pagination } from "@/components/common/Pagination";
import { SearchInput } from "@/components/common/SearchInput";
import { useNow } from "@/hooks/useNow";
import { useUrlSearch } from "@/hooks/useUrlSearch";
import { DEFAULT_PAGE_SIZE, POST_TYPE_LABELS } from "@/lib/constants";
import { usePosts } from "@/features/posts/hooks";
import { CategoryFilter } from "@/features/posts/components/CategoryFilter";
import { POST_GRID, PostCard, PostListSkeleton } from "@/features/posts/components/PostCard";
import type { PostType } from "@/types/api";

/** Community feed types; repairs and lost & found have their own pages. */
const TYPES: PostType[] = ["general", "announcement", "event"];

interface PostsBrowserProps {
  facultyId?: number;
  /** hide the filter bar (e.g. embedded lists) */
  compact?: boolean;
}

/**
 * Community feed of ACTIVE posts (the API hides general posts / announcements after 24h and
 * events after they end). Filters are mirrored into the URL (?q=&category=&type=&page=).
 */
export function PostsBrowser({ facultyId, compact }: PostsBrowserProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const now = useNow();

  const category = params.get("category") ?? undefined;
  const typeParam = params.get("type");
  const type = TYPES.includes(typeParam as PostType) ? (typeParam as PostType) : undefined;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const { q, setQ, urlQ } = useUrlSearch({ enabled: !compact });

  const setParams = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const query = usePosts({
    q: compact ? undefined : urlQ || undefined,
    category: compact ? undefined : category,
    type: compact ? undefined : type,
    faculty_id: facultyId,
    page: compact ? 1 : page,
    page_size: DEFAULT_PAGE_SIZE,
  });

  const filtered = !!(urlQ || category || type);

  return (
    <div className="space-y-5">
      {!compact && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
            <SearchInput id="posts-search" label="ค้นหาโพสต์" value={q} onChange={setQ} placeholder="ค้นหาหัวข้อหรือเนื้อหา…" />
            <div>
              <label htmlFor="posts-type" className="sr-only">
                ประเภทโพสต์
              </label>
              <Select
                id="posts-type"
                value={type ?? ""}
                onChange={(e) => setParams({ type: e.target.value || undefined, page: undefined })}
              >
                <option value="">ทุกประเภท</option>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {POST_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <CategoryFilter value={category} onChange={(slug) => setParams({ category: slug, page: undefined })} />
        </div>
      )}

      <div aria-live="polite" aria-busy={query.isFetching || undefined}>
        {query.isLoading ? (
          <PostListSkeleton count={4} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : query.data && query.data.items.length === 0 ? (
          <EmptyState
            icon={filtered ? <SearchX /> : undefined}
            title={filtered ? "ไม่พบโพสต์ที่ตรงกับเงื่อนไข" : "ยังไม่มีโพสต์ใน 24 ชั่วโมงที่ผ่านมา"}
            description={
              filtered ? "ลองเปลี่ยนคำค้นหาหรือหมวดหมู่" : "โพสต์ที่เกิน 24 ชั่วโมงยังดูได้ในประวัติโพสต์ของผู้เขียน"
            }
          />
        ) : query.data ? (
          <div className="space-y-5">
            {!compact && (
              <p className="text-sm text-muted-foreground">
                พบ {query.data.total.toLocaleString("th-TH")} โพสต์ที่ยังแสดงอยู่
                {type === "event" ? " — เรียงตามวันเริ่มกิจกรรม แล้วตามระดับความสำคัญ" : ""}
              </p>
            )}
            <ul className={POST_GRID}>
              {query.data.items.map((p) => (
                <li key={p.id}>
                  <PostCard post={p} now={now} headingLevel="h2" showActions />
                </li>
              ))}
            </ul>
            {!compact && (
              <Pagination
                page={query.data.page}
                pageSize={query.data.page_size}
                total={query.data.total}
                onPageChange={(p) => setParams({ page: p > 1 ? String(p) : undefined })}
              />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
