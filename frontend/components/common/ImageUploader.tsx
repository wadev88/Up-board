"use client";

import * as React from "react";
import { useId, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { uploadFile, validateImageFile } from "@/services/uploads";
import { getErrorMessage } from "@/services/apiClient";
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export interface UploadedImage {
  id: number;
  url: string;
}

interface Item {
  key: string;
  id?: number;
  previewUrl: string;
  /** object URL that must be revoked */
  objectUrl?: string;
  name: string;
  status: "uploading" | "done" | "error";
  error?: string;
}

interface ImageUploaderProps {
  /** Called with the ids of successfully uploaded images (in order). */
  onChange: (ids: number[]) => void;
  /** Called while uploads are in progress so forms can block submit. */
  onUploadingChange?: (uploading: boolean) => void;
  initial?: UploadedImage[];
  max?: number;
  label?: string;
  hint?: React.ReactNode;
  error?: string;
  /** Big friendly drop zone (photo-first forms such as the repair wizard). */
  large?: boolean;
  className?: string;
}

let keySeq = 0;

/**
 * Uploads images to POST /uploads (multipart `file`) as soon as they are picked.
 * Client-side checks: jpeg/png/webp, ≤5MB, up to `max` images (default 4).
 */
export function ImageUploader({
  onChange,
  onUploadingChange,
  initial = [],
  max = MAX_IMAGES,
  label = "รูปภาพ",
  hint,
  error,
  large = false,
  className,
}: ImageUploaderProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>(() =>
    initial.map((img) => ({
      key: `init-${img.id}`,
      id: img.id,
      previewUrl: img.url,
      name: `รูปที่ ${img.id}`,
      status: "done" as const,
    })),
  );
  const itemsRef = useRef(items);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const commit = (fn: (prev: Item[]) => Item[]) => {
    const next = fn(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
    onChange(next.filter((i) => i.status === "done" && i.id !== undefined).map((i) => i.id as number));
    onUploadingChange?.(next.some((i) => i.status === "uploading"));
  };

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    setMessage(null);
    const slots = max - itemsRef.current.filter((i) => i.status !== "error").length;
    const files = Array.from(fileList);
    if (files.length > slots) setMessage(`แนบรูปได้สูงสุด ${max} รูป`);
    for (const file of files.slice(0, Math.max(0, slots))) {
      const invalid = validateImageFile(file);
      if (invalid) {
        setMessage(`${file.name}: ${invalid}`);
        continue;
      }
      const objectUrl = URL.createObjectURL(file);
      const key = `up-${++keySeq}`;
      commit((prev) => [...prev, { key, previewUrl: objectUrl, objectUrl, name: file.name, status: "uploading" }]);
      uploadFile(file)
        .then((res) =>
          commit((prev) => prev.map((i) => (i.key === key ? { ...i, id: res.id, status: "done" } : i))),
        )
        .catch((e: unknown) =>
          commit((prev) =>
            prev.map((i) => (i.key === key ? { ...i, status: "error", error: getErrorMessage(e) } : i)),
          ),
        );
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = (key: string) => {
    const item = itemsRef.current.find((i) => i.key === key);
    if (item?.objectUrl) URL.revokeObjectURL(item.objectUrl);
    commit((prev) => prev.filter((i) => i.key !== key));
  };

  const activeCount = items.filter((i) => i.status !== "error").length;
  const describedBy = [error || message ? `${inputId}-error` : null, `${inputId}-hint`]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cn("grid gap-2", className)}>
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      {large && items.length === 0 && (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-input bg-subtle/60 p-6 text-center transition-colors hover:border-primary hover:bg-primary-soft/40 focus-within:ring-2 focus-within:ring-ring",
            dragging && "border-primary bg-primary-soft/60",
          )}
        >
          <span className="inline-flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Camera className="size-7" aria-hidden="true" />
          </span>
          <span className="text-base font-semibold text-foreground">แตะเพื่อถ่ายหรือเลือกรูป</span>
          <span className="text-sm text-muted-foreground">หรือลากรูปมาวางที่นี่</span>
        </label>
      )}
      <ul
        className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", large && items.length === 0 && "hidden")}
        aria-label="รูปภาพที่เลือก"
      >
        {items.map((item) => (
          <li key={item.key} className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob / backend file URLs */}
            <img src={item.previewUrl} alt={item.name} className={cn("size-full object-cover", item.status !== "done" && "opacity-60")} />
            {item.status === "uploading" && (
              <span className="absolute inset-0 flex items-center justify-center" role="status">
                <Loader2 className="size-6 animate-spin text-foreground" aria-hidden="true" />
                <span className="sr-only">กำลังอัปโหลด {item.name}</span>
              </span>
            )}
            {item.status === "error" && (
              <span className="absolute inset-x-0 bottom-0 bg-red-600/90 px-2 py-1 text-xs text-white" role="alert">
                {item.error}
              </span>
            )}
            <button
              type="button"
              onClick={() => remove(item.key)}
              className="absolute right-1 top-1 inline-flex size-10 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label={`ลบรูป ${item.name}`}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </li>
        ))}
        {activeCount < max && (
          <li>
            <label
              htmlFor={inputId}
              className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-input text-muted-foreground transition-colors hover:bg-muted focus-within:ring-2 focus-within:ring-ring"
            >
              <ImagePlus className="size-6" aria-hidden="true" />
              <span className="text-xs">เพิ่มรูป</span>
            </label>
          </li>
        )}
      </ul>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        multiple
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
        aria-describedby={describedBy}
        aria-invalid={!!(error || message) || undefined}
        disabled={activeCount >= max}
      />
      <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">
        {hint ?? `JPEG, PNG หรือ WebP ไม่เกิน 5 MB สูงสุด ${max} รูป (${activeCount}/${max})`}
      </p>
      {(error || message) && (
        <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive">
          {error ?? message}
        </p>
      )}
    </div>
  );
}
