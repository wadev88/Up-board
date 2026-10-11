"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SEARCH_MAX_LENGTH } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  id: string;
  /** accessible label (visually hidden) */
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/** Search box used by the list pages (posts, repairs, lost & found). */
export function SearchInput({ id, label, value, onChange, placeholder, className }: SearchInputProps) {
  return (
    <div className={cn("relative", className)} role="search">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        id={id}
        type="search"
        value={value}
        maxLength={SEARCH_MAX_LENGTH}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
      />
    </div>
  );
}
