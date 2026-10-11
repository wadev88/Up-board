"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { POST_TYPE_LABELS } from "@/lib/constants";
import { creatablePostTypes } from "@/lib/permissions";
import { useAuth } from "@/hooks/useAuth";
import { ChangeTypeButton } from "@/features/posts/components/ChangeTypeButton";
import { PostForm } from "@/features/posts/components/PostForm";
import { PostTypePicker } from "@/features/posts/components/PostTypePicker";
import { createHref } from "@/features/posts/createTypes";

type FormType = "general" | "announcement" | "event";
const FORM_TYPES: readonly string[] = ["general", "announcement", "event"];

/**
 * Create Post (general / announcement / event). The type is chosen first, in the popup, and
 * lives in the URL (?type=event); the form never asks for it again. Without a valid ?type= the
 * popup opens straight away. Repairs and lost & found have their own routes (old
 * /posts/new?type=repair links are forwarded).
 */
export function CreatePostScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const allowed = creatablePostTypes(user);
  const raw = params.get("type");
  const type = FORM_TYPES.includes(raw ?? "") && allowed.includes(raw as FormType) ? (raw as FormType) : undefined;
  const forward = raw === "repair" || raw === "lost_found" ? createHref(raw) : undefined;
  // closing the popup without choosing leaves a button to reopen it
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (forward) router.replace(forward);
  }, [forward, router]);

  if (forward) return null;
  if (allowed.length === 0) return null;

  if (!type) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card p-6 text-center shadow-card">
        <p className="mb-4 text-sm text-muted-foreground">เลือกประเภทโพสต์ที่ต้องการสร้างก่อน</p>
        <Button type="button" onClick={() => setDismissed(false)}>
          เลือกประเภทโพสต์
        </Button>
        <PostTypePicker open={!dismissed} onOpenChange={(o) => setDismissed(!o)} onChosen={() => setDismissed(false)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        ประเภท: <span className="font-medium text-foreground">{POST_TYPE_LABELS[type]}</span> · <ChangeTypeButton />
      </p>
      <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-card sm:p-6">
        <PostForm key={type} type={type} />
      </div>
    </div>
  );
}
