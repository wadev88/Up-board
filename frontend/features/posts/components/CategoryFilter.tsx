"use client";

import { useCategories } from "@/features/posts/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface CategoryFilterProps {
  value: string | undefined;
  onChange: (slug: string | undefined) => void;
}

const chip =
  "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-8 md:px-3";

/** Horizontal, scrollable category chips (GET /categories). */
export function CategoryFilter({ value, onChange }: CategoryFilterProps) {
  const { data, isLoading } = useCategories();
  if (isLoading) {
    return (
      <div className="flex gap-2" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
    );
  }
  const items = [{ slug: undefined as string | undefined, name_th: "ทั้งหมด" }, ...(data ?? [])];
  return (
    <div role="group" aria-label="กรองตามหมวดหมู่" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
      {items.map((c) => {
        const active = value === c.slug;
        return (
          <button
            key={c.slug ?? "all"}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(c.slug)}
            className={cn(
              chip,
              active
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {c.name_th}
          </button>
        );
      })}
    </div>
  );
}
