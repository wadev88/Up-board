"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField, fieldDescribedBy } from "@/components/ui/form-field";
import { ImageUploader } from "@/components/common/ImageUploader";
import { useAuth } from "@/hooks/useAuth";
import { useRepairs } from "@/features/repairs/hooks";
import { allowedEventPriorities, allowedPriorities, maxEventPriority, roleCan } from "@/lib/permissions";
import { ACTIVE_REPAIR_STATUSES, EVENT_PRIORITY_LABELS, POST_TYPE_LABELS, PRIORITY_LABELS } from "@/lib/constants";
import { reportFormError } from "@/lib/forms";
import { useCreatePost, useUpdatePost } from "@/features/posts/hooks";
import { postFormSchema, type PostFormValues } from "@/features/posts/schemas";
import { postHref } from "@/features/posts/utils";
import { buildCreatePostBody, buildUpdatePostBody, postToFormValues } from "@/features/posts/formBody";
import { SuspensionNotice, useSuspendedUntil } from "@/features/auth/components/AccountNotices";
import type { EventPriority, Post, Priority } from "@/types/api";

const FIELDS = [
  "type",
  "title",
  "content",
  "priority",
  "event_starts_at",
  "event_ends_at",
  "event_venue",
  "event_priority",
  "related_repair_id",
  "attachment_ids",
] as const;

const SERVER_ALIASES: Record<string, string> = {
  starts_at: "event_starts_at",
  ends_at: "event_ends_at",
  venue: "event_venue",
  priority_level: "event_priority",
  event: "event_starts_at",
};

interface PostFormProps {
  /** when provided the form edits this post (PATCH /posts/{id}) */
  post?: Post;
  /** new posts: which of general / announcement / event (chosen on the Create Post page) */
  type?: "general" | "announcement" | "event";
}

export function PostForm({ post, type: initialType }: PostFormProps) {
  const router = useRouter();
  const { user } = useAuth();
  const isEdit = !!post;
  const isSpecialType = post?.type === "repair" || post?.type === "lost_found";
  const create = useCreatePost();
  const update = useUpdatePost(post?.id ?? 0);
  const [uploading, setUploading] = useState(false);
  // the API refuses new posts while suspended; mirror it so the user is not surprised
  const suspended = !!useSuspendedUntil() && !isEdit;

  // initial values, also the baseline for "only send what changed" on edit
  const [initialValues] = useState(() =>
    postToFormValues(post, { type: initialType, eventPriority: maxEventPriority(user) }),
  );
  const form = useForm<PostFormValues>({
    resolver: zodResolver(postFormSchema),
    defaultValues: initialValues,
  });
  const { errors, isSubmitting } = form.formState;
  const type = useWatch({ control: form.control, name: "type" });
  const eventPriorities: EventPriority[] = allowedEventPriorities(user);
  if (post?.event && !eventPriorities.includes(post.event.priority_level)) {
    eventPriorities.unshift(post.event.priority_level);
  }

  // (React Compiler memoizes these automatically)
  // announcements may point at an unfinished repair
  const repairs = useRepairs({ page_size: 50 }, { enabled: type === "announcement" });
  const repairOptions = (repairs.data?.items ?? []).filter(
    (p) => p.repair && ACTIVE_REPAIR_STATUSES.includes(p.repair.status),
  );
  if (post?.related_repair_id && !repairOptions.some((p) => p.id === post.related_repair_id)) {
    repairOptions.unshift({ id: post.related_repair_id, title: `งานซ่อม #${post.related_repair_id}` } as Post);
  }

  const priorities: Priority[] = [...allowedPriorities(user)];
  if (post && !priorities.includes(post.priority)) priorities.push(post.priority);
  // club accounts cannot choose: priority stays "normal", event level stays department
  const canChoosePriority = roleCan(user, "post:set_priority");

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      let saved: Post;
      if (isEdit && post) {
        const body = buildUpdatePostBody(initialValues, v, { isSpecialType });
        if (Object.keys(body).length === 0) {
          toast.info("ไม่มีการเปลี่ยนแปลง");
          router.push(postHref(post));
          return;
        }
        saved = await update.mutateAsync(body);
        toast.success("บันทึกการแก้ไขแล้ว");
      } else {
        saved = await create.mutateAsync(buildCreatePostBody(v));
        toast.success("เผยแพร่โพสต์แล้ว");
      }
      router.push(postHref(saved));
    } catch (e) {
      reportFormError(e, form.setError, FIELDS, { aliases: SERVER_ALIASES });
    }
  });

  const err = (name: keyof PostFormValues) => errors[name]?.message as string | undefined;

  return (
    <form onSubmit={onSubmit} className="mx-auto grid max-w-[720px] gap-5" noValidate>
      {isEdit && !isSpecialType && (
        <p className="text-sm text-muted-foreground">
          ประเภท: <span className="font-medium text-foreground">{POST_TYPE_LABELS[type]}</span>
        </p>
      )}

      <FormField id="post-title" label="หัวข้อ" required error={err("title")}>
        <Input
          id="post-title"
          autoComplete="off"
          aria-invalid={!!errors.title || undefined}
          aria-describedby={fieldDescribedBy("post-title", err("title"))}
          {...form.register("title")}
        />
      </FormField>

      <FormField id="post-content" label="รายละเอียด" required error={err("content")}>
        <Textarea
          id="post-content"
          rows={6}
          aria-invalid={!!errors.content || undefined}
          aria-describedby={fieldDescribedBy("post-content", err("content"))}
          {...form.register("content")}
        />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        {canChoosePriority && (
          <FormField
            id="post-priority"
            label="ความสำคัญ"
            error={err("priority")}
            hint={
              priorities.includes("urgent")
                ? undefined
                : "“ด่วนมาก” ใช้ได้เฉพาะเจ้าหน้าที่กองอาคารสถานที่ และผู้ดูแลระบบ"
            }
          >
            <Select
              id="post-priority"
              aria-describedby={fieldDescribedBy("post-priority", err("priority"), !priorities.includes("urgent"))}
              {...form.register("priority")}
            >
              {priorities.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </Select>
          </FormField>
        )}
      </div>

      {type === "announcement" && !isSpecialType && (
        <FormField
          id="post-related-repair"
          label="เกี่ยวข้องกับงานแจ้งซ่อม (ไม่บังคับ)"
          error={err("related_repair_id")}
          hint="ถ้าเลือก ประกาศที่ปักหมุดจะอยู่จนกว่างานซ่อมนั้นจะปิดงานหรือถูกปฏิเสธ"
        >
          <Select
            id="post-related-repair"
            disabled={repairs.isLoading}
            {...form.register("related_repair_id", { valueAsNumber: true })}
          >
            <option value={0}>{repairs.isLoading ? "กำลังโหลด…" : "— ไม่เกี่ยวข้อง —"}</option>
            {repairOptions.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.id} {p.title}
              </option>
            ))}
          </Select>
        </FormField>
      )}

      {type === "event" && !isSpecialType && (
        <fieldset className="grid gap-5 rounded-2xl border border-border bg-subtle/60 p-4">
          <legend className="px-1 text-sm font-medium">รายละเอียดกิจกรรม</legend>
          <p className="-mt-2 text-xs text-muted-foreground">
            กิจกรรมจะแสดงในรายการ “กำลังจะมาถึง” จนถึงเวลาสิ้นสุด แล้วย้ายไปอยู่ในประวัติโพสต์ของคุณ
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField id="event-starts" label="เริ่ม" required error={err("event_starts_at")}>
              <Input
                id="event-starts"
                type="datetime-local"
                aria-invalid={!!errors.event_starts_at || undefined}
                aria-describedby={fieldDescribedBy("event-starts", err("event_starts_at"))}
                {...form.register("event_starts_at")}
              />
            </FormField>
            <FormField id="event-ends" label="สิ้นสุด" required error={err("event_ends_at")}>
              <Input
                id="event-ends"
                type="datetime-local"
                aria-invalid={!!errors.event_ends_at || undefined}
                aria-describedby={fieldDescribedBy("event-ends", err("event_ends_at"))}
                {...form.register("event_ends_at")}
              />
            </FormField>
          </div>
          {canChoosePriority ? (
            <FormField
              id="event-priority"
              label="ระดับความสำคัญของกิจกรรม"
              error={err("event_priority")}
              hint="เรียงลำดับ: มหาวิทยาลัย > คณะ > สาขา/ชมรม ระดับที่เลือกได้ขึ้นกับบทบาทของคุณ"
            >
              <Select
                id="event-priority"
                aria-describedby={fieldDescribedBy("event-priority", err("event_priority"), true)}
                {...form.register("event_priority")}
              >
                {eventPriorities.map((p) => (
                  <option key={p} value={p}>
                    {EVENT_PRIORITY_LABELS[p]}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : (
            <p className="text-sm text-muted-foreground">
              ระดับความสำคัญ: {EVENT_PRIORITY_LABELS[maxEventPriority(user)]} (กำหนดตามบทบาทของบัญชี)
            </p>
          )}
          <FormField id="event-venue" label="สถานที่" error={err("event_venue")}>
            <Input
              id="event-venue"
              placeholder="เช่น หอประชุมพญางำเมือง"
              aria-invalid={!!errors.event_venue || undefined}
              aria-describedby={fieldDescribedBy("event-venue", err("event_venue"))}
              {...form.register("event_venue")}
            />
          </FormField>
        </fieldset>
      )}

      <ImageUploader
        label="รูปภาพประกอบ"
        initial={post?.attachments.filter((a) => a.kind === "image").map((a) => ({ id: a.id, url: a.url }))}
        onChange={(ids) => form.setValue("attachment_ids", ids, { shouldDirty: true })}
        onUploadingChange={setUploading}
        error={err("attachment_ids")}
      />

      {suspended && <SuspensionNotice />}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          ยกเลิก
        </Button>
        <Button type="submit" loading={isSubmitting} disabled={uploading || suspended}>
          {uploading ? "กำลังอัปโหลดรูป…" : isEdit ? "บันทึกการแก้ไข" : "เผยแพร่โพสต์"}
        </Button>
      </div>
    </form>
  );
}
