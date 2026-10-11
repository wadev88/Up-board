"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { PRIORITY_LABELS } from "@/lib/constants";
import { isApiError } from "@/services/apiClient";
import { useSetRepairPriority } from "@/features/repairs/hooks";
import type { Post, Priority } from "@/types/api";

const PRIORITIES: Priority[] = ["low", "normal", "high", "urgent"];

/** Building staff triage: reporters never choose the urgency, staff set it here. */
export function RepairPriorityControl({ post }: { post: Post }) {
  const mutation = useSetRepairPriority(post.id);
  const [error, setError] = useState<string | null>(null);

  const onChange = async (priority: Priority) => {
    setError(null);
    try {
      await mutation.mutateAsync(priority);
      toast.success(`ตั้งความเร่งด่วนเป็น “${PRIORITY_LABELS[priority]}” แล้ว`);
    } catch (err) {
      setError(isApiError(err) ? err.userMessage : "บันทึกไม่สำเร็จ กรุณาลองใหม่");
    }
  };

  return (
    <FormField
      id="repair-priority"
      label="ความเร่งด่วน"
      hint="ผู้แจ้งเลือกเองไม่ได้ งานใหม่เริ่มที่ “ปกติ”"
      error={error ?? undefined}
    >
      <Select
        id="repair-priority"
        value={post.priority}
        disabled={mutation.isPending}
        onChange={(e) => void onChange(e.target.value as Priority)}
      >
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABELS[p]}
          </option>
        ))}
      </Select>
    </FormField>
  );
}
