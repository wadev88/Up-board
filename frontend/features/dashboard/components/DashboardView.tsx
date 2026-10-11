"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  LayoutGrid,
  Megaphone,
  PackageSearch,
  Pin,
  Search,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { useDashboard } from "@/features/dashboard/hooks";
import { usePosts } from "@/features/posts/hooks";
import { useRepairs } from "@/features/repairs/hooks";
import { useLostFoundList } from "@/features/lost-found/hooks";
import { POST_GRID, PostCard, PostListSkeleton } from "@/features/posts/components/PostCard";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useNow } from "@/hooks/useNow";
import { PINNED_DISPLAY_LIMIT, SEARCH_MAX_LENGTH } from "@/lib/constants";
import type { Page, Post } from "@/types/api";

const PREVIEW_SIZE = 6;

/* ---------- hero ---------- */

const QUICK_ACTIONS: { href: string; label: string; icon: LucideIcon; variant: "default" | "accent" | "outline" }[] = [
  { href: "/posts?type=announcement", label: "ประกาศ", icon: Megaphone, variant: "outline" },
  { href: "/calendar", label: "ปฏิทินกิจกรรม", icon: CalendarDays, variant: "outline" },
  { href: "/repairs/new", label: "แจ้งเหตุ / แจ้งซ่อม", icon: Wrench, variant: "accent" },
  { href: "/lost-found", label: "ของหาย & พบของ", icon: PackageSearch, variant: "outline" },
];

function SearchBar() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        router.push(term ? `/posts?q=${encodeURIComponent(term)}` : "/posts");
      }}
      className="relative max-w-xl"
    >
      <label htmlFor="dashboard-search" className="sr-only">
        ค้นหาโพสต์
      </label>
      <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        id="dashboard-search"
        type="search"
        value={q}
        maxLength={SEARCH_MAX_LENGTH}
        onChange={(e) => setQ(e.target.value)}
        placeholder="ค้นหาประกาศ กิจกรรม ของหาย…"
        className="h-12 rounded-full bg-card pl-11 shadow-card"
      />
    </form>
  );
}

function Hero({ name }: { name?: string }) {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative overflow-hidden rounded-3xl border border-primary/10 bg-linear-to-br from-primary-soft via-card to-secondary-soft p-6 shadow-card sm:p-8"
    >
      {/* decorative shapes — hidden from assistive tech */}
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-primary/10" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 right-24 size-40 rounded-full bg-secondary/30" />
      <div className="relative space-y-5">
        <div className="max-w-2xl space-y-2">
          <p className="text-sm font-medium text-primary">ชุมชนมหาวิทยาลัยพะเยา</p>
          <h1 id="hero-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            สวัสดี{name ? ` ${name}` : ""} ยินดีต้อนรับสู่ UP Board
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            แบ่งปันประกาศ ค้นหากิจกรรมในมหาวิทยาลัย แจ้งจุดชำรุดให้เจ้าหน้าที่ และลงประกาศของหาย–พบของ ได้ในที่เดียว
          </p>
        </div>
        <SearchBar />
        <nav aria-label="ทางลัด" className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map(({ href, label, icon: Icon, variant }) => (
            <Button key={href} asChild variant={variant}>
              <Link href={href}>
                <Icon aria-hidden="true" />
                {label}
              </Link>
            </Button>
          ))}
        </nav>
      </div>
    </section>
  );
}

/* ---------- sections ---------- */

function SectionHeading({
  id,
  icon: Icon,
  title,
  count,
  href,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  count?: number;
  href?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 id={id} className="flex items-center gap-2 text-lg font-semibold">
        <Icon className="size-5 text-primary" aria-hidden="true" />
        {title}
        {count !== undefined && <span className="text-sm font-normal text-muted-foreground">({count})</span>}
      </h2>
      {href && (
        <Button asChild variant="link" size="sm">
          <Link href={href}>
            ดูทั้งหมด
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      )}
    </div>
  );
}

function CardGrid({ posts, now, testId }: { posts: Post[]; now: number; testId?: string }) {
  return (
    <ul className={POST_GRID} data-testid={testId}>
      {posts.map((p) => (
        <li key={p.id}>
          <PostCard post={p} now={now} showActions />
        </li>
      ))}
    </ul>
  );
}

/** One tab backed by its own list endpoint (first page only; "see all" opens the full page). */
function ListTab({
  query,
  now,
  empty,
  href,
  action,
}: {
  query: UseQueryResult<Page<Post>>;
  now: number;
  empty: string;
  href: string;
  action?: React.ReactNode;
}) {
  if (query.isLoading) return <PostListSkeleton count={3} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const items = query.data?.items ?? [];
  if (items.length === 0) return <EmptyState title={empty} action={action} />;
  return (
    <div className="space-y-4">
      <CardGrid posts={items} now={now} />
      {(query.data?.total ?? 0) > items.length && (
        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link href={href}>
              ดูทั้งหมด {query.data?.total.toLocaleString("th-TH")} รายการ
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

type FeedTab = "all" | "announcement" | "event" | "repair" | "lost_found";

const TABS: { value: FeedTab; label: string; icon: LucideIcon }[] = [
  { value: "all", label: "ทั้งหมด", icon: LayoutGrid },
  { value: "announcement", label: "ประกาศ", icon: Megaphone },
  { value: "event", label: "กิจกรรม", icon: CalendarDays },
  { value: "repair", label: "แจ้งซ่อม", icon: Wrench },
  { value: "lost_found", label: "ของหาย & พบของ", icon: PackageSearch },
];

function FeedTabs({ now }: { now: number }) {
  const [tab, setTab] = useState<FeedTab>("all");
  const dashboard = useDashboard();
  // each list is fetched only when its tab is opened
  const announcements = usePosts({ type: "announcement", page_size: PREVIEW_SIZE }, { enabled: tab === "announcement" });
  const events = usePosts({ type: "event", page_size: PREVIEW_SIZE }, { enabled: tab === "event" });
  const repairs = useRepairs({ page_size: PREVIEW_SIZE }, { enabled: tab === "repair" });
  const lostFound = useLostFoundList({ page_size: PREVIEW_SIZE }, { enabled: tab === "lost_found" });

  let all: React.ReactNode;
  if (dashboard.isLoading) all = <PostListSkeleton count={3} />;
  else if (dashboard.isError) all = <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />;
  else if (dashboard.data) {
    const { upcoming, recent, repairs: activeRepairs = [], lost_found: searching = [] } = dashboard.data;
    all = (
      <div className="space-y-8">
        <section aria-labelledby="dashboard-upcoming-heading" data-testid="dashboard-section-upcoming" className="space-y-3">
          <SectionHeading id="dashboard-upcoming-heading" icon={CalendarDays} title="กิจกรรมที่กำลังจะมาถึง" count={upcoming.length} href="/posts?type=event" />
          {upcoming.length === 0 ? (
            <EmptyState title="ยังไม่มีกิจกรรมที่กำลังจะมาถึง" description="กิจกรรมจะแสดงที่นี่จนถึงเวลาสิ้นสุด" />
          ) : (
            <CardGrid posts={upcoming.slice(0, PREVIEW_SIZE)} now={now} />
          )}
        </section>
        <section aria-labelledby="dashboard-repairs-heading" data-testid="dashboard-section-repairs" className="space-y-3">
          <SectionHeading id="dashboard-repairs-heading" icon={Wrench} title="งานซ่อมที่ยังไม่เสร็จ" count={activeRepairs.length} href="/repairs" />
          {activeRepairs.length === 0 ? (
            <EmptyState title="ไม่มีงานซ่อมที่ค้างอยู่" description="งานที่ปิดแล้วหรือถูกปฏิเสธจะออกจากรายการนี้" />
          ) : (
            <CardGrid posts={activeRepairs.slice(0, PREVIEW_SIZE)} now={now} />
          )}
        </section>
        <section aria-labelledby="dashboard-lostfound-heading" data-testid="dashboard-section-lost-found" className="space-y-3">
          <SectionHeading id="dashboard-lostfound-heading" icon={PackageSearch} title="ของหายที่ยังค้นหา" count={searching.length} href="/lost-found" />
          {searching.length === 0 ? (
            <EmptyState title="ไม่มีประกาศของหาย/พบของที่ยังค้นหา" description="ประกาศแสดง 7 วัน หรือจนกว่าจะพบของแล้ว" />
          ) : (
            <CardGrid posts={searching.slice(0, PREVIEW_SIZE)} now={now} />
          )}
        </section>
        <section aria-labelledby="dashboard-recent-heading" data-testid="dashboard-section-recent" className="space-y-3">
          <SectionHeading id="dashboard-recent-heading" icon={LayoutGrid} title="ล่าสุดใน 24 ชั่วโมง" count={recent.length} href="/posts" />
          {recent.length === 0 ? (
            <EmptyState
              title="ยังไม่มีโพสต์ใหม่ใน 24 ชั่วโมงที่ผ่านมา"
              description="เริ่มแบ่งปันข่าวสารให้ชุมชนได้เลย"
            />
          ) : (
            <CardGrid posts={recent} now={now} />
          )}
        </section>
      </div>
    );
  }

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as FeedTab)}>
      <TabsList aria-label="ตัวกรองประเภทโพสต์">
        {TABS.map(({ value, label, icon: Icon }) => (
          <TabsTrigger key={value} value={value}>
            <Icon aria-hidden="true" />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="all">{all}</TabsContent>
      <TabsContent value="announcement">
        <ListTab query={announcements} now={now} empty="ไม่มีประกาศใน 7 วันที่ผ่านมา" href="/posts?type=announcement" />
      </TabsContent>
      <TabsContent value="event">
        <ListTab query={events} now={now} empty="ยังไม่มีกิจกรรมที่กำลังจะมาถึง" href="/posts?type=event" />
      </TabsContent>
      <TabsContent value="repair">
        <ListTab
          query={repairs}
          now={now}
          empty="ไม่มีงานแจ้งซ่อมที่ยังไม่เสร็จ"
          href="/repairs"
          action={
            <Button asChild variant="accent">
              <Link href="/repairs/new">แจ้งซ่อม</Link>
            </Button>
          }
        />
      </TabsContent>
      <TabsContent value="lost_found">
        <ListTab query={lostFound} now={now} empty="ไม่มีประกาศของหายหรือพบของที่ยังตามหาอยู่" href="/lost-found" />
      </TabsContent>
    </Tabs>
  );
}

function PinnedSection({ posts, now }: { posts: Post[]; now: number }) {
  if (posts.length === 0) return null;
  return (
    <section aria-labelledby="dashboard-pinned-heading" data-testid="dashboard-section-pinned" className="space-y-3">
      <SectionHeading id="dashboard-pinned-heading" icon={Pin} title="ปักหมุด" count={posts.length} />
      <p className="text-xs text-muted-foreground">แสดงสูงสุด {PINNED_DISPLAY_LIMIT} โพสต์ หากมีมากกว่านั้นระบบจะหมุนเวียนแสดง</p>
      <CardGrid posts={posts} now={now} />
    </section>
  );
}

export function DashboardView() {
  const { user } = useAuth();
  const { data } = useDashboard();
  const now = useNow();

  return (
    <div className="space-y-8">
      <Hero name={user?.display_name} />
      <PinnedSection posts={data?.pinned ?? []} now={now} />
      <FeedTabs now={now} />
    </div>
  );
}
