"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { FormField, fieldDescribedBy } from "@/components/ui/form-field";
import { ImageUploader } from "@/components/common/ImageUploader";
import { localInputToIso } from "@/lib/format";
import { reportFormError } from "@/lib/forms";
import { useCreateLostFound } from "@/features/lost-found/hooks";
import { lostFoundFormSchema, type LostFoundFormValues } from "@/features/lost-found/schemas";
import { SuspensionNotice, useSuspendedUntil } from "@/features/auth/components/AccountNotices";

const FIELDS = ["status", "title", "content", "location", "occurred_at", "attachment_ids"] as const;

export function LostFoundForm() {
  const router = useRouter();
  const create = useCreateLostFound();
  const [uploading, setUploading] = useState(false);
  const suspended = !!useSuspendedUntil(); // the API refuses lost & found posts while suspended
  const form = useForm<LostFoundFormValues>({
    resolver: zodResolver(lostFoundFormSchema),
    defaultValues: { status: "lost", title: "", content: "", location: "", occurred_at: "", attachment_ids: [] },
  });
  const { errors, isSubmitting } = form.formState;
  const err = (n: keyof LostFoundFormValues) => errors[n]?.message as string | undefined;

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      const post = await create.mutateAsync({
        title: v.title,
        content: v.content,
        location: v.location,
        status: v.status,
        ...(v.occurred_at ? { occurred_at: localInputToIso(v.occurred_at) } : {}),
        attachment_ids: v.attachment_ids,
      });
      toast.success("ลงประกาศแล้ว");
      router.push(`/lost-found/${post.id}`);
    } catch (e) {
      reportFormError(e, form.setError, FIELDS);
    }
  });

  return (
    <form onSubmit={onSubmit} className="mx-auto grid max-w-[720px] gap-5" noValidate>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">ประเภท</legend>
        <Controller
          control={form.control}
          name="status"
          render={({ field }) => (
            <RadioGroup value={field.value} onValueChange={field.onChange} className="grid-cols-2" aria-label="ประเภทประกาศ">
              {(["lost", "found"] as const).map((s) => (
                <Label
                  key={s}
                  htmlFor={`lf-${s}`}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-border px-4 has-[[data-state=checked]]:border-primary"
                >
                  <RadioGroupItem value={s} id={`lf-${s}`} />
                  {s === "lost" ? "ฉันทำของหาย" : "ฉันพบของ"}
                </Label>
              ))}
            </RadioGroup>
          )}
        />
      </fieldset>
      <FormField id="lf-title" label="หัวข้อ" required error={err("title")}>
        <Input id="lf-title" placeholder="เช่น กระเป๋าสตางค์สีดำ" aria-invalid={!!errors.title || undefined} aria-describedby={fieldDescribedBy("lf-title", err("title"))} {...form.register("title")} />
      </FormField>
      <FormField id="lf-content" label="รายละเอียด / ลักษณะ" required error={err("content")} hint="หลีกเลี่ยงการเปิดเผยข้อมูลส่วนตัว เช่น เลขบัตรประชาชน">
        <Textarea id="lf-content" rows={4} aria-invalid={!!errors.content || undefined} aria-describedby={fieldDescribedBy("lf-content", err("content"), true)} {...form.register("content")} />
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="lf-location" label="สถานที่" required error={err("location")}>
          <Input id="lf-location" aria-invalid={!!errors.location || undefined} aria-describedby={fieldDescribedBy("lf-location", err("location"))} {...form.register("location")} />
        </FormField>
        <FormField id="lf-occurred" label="วันเวลาที่หาย/พบ" error={err("occurred_at")}>
          <Input id="lf-occurred" type="datetime-local" {...form.register("occurred_at")} />
        </FormField>
      </div>
      <ImageUploader
        label="รูปภาพ"
        onChange={(ids) => form.setValue("attachment_ids", ids)}
        onUploadingChange={setUploading}
        error={err("attachment_ids")}
      />
      {suspended && <SuspensionNotice />}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          ยกเลิก
        </Button>
        <Button type="submit" loading={isSubmitting} disabled={uploading || suspended}>
          ลงประกาศ
        </Button>
      </div>
    </form>
  );
}
