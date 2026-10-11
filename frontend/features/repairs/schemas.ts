import { z } from "zod";
import { contentSchema, prioritySchema, titleSchema } from "@/features/posts/schemas";

/** Building staff set the urgency after triage; reporters never choose it. */
export const repairPrioritySchema = z.object({ priority: prioritySchema });
export type RepairPriorityValues = z.infer<typeof repairPrioritySchema>;

export const repairFormSchema = z.object({
  attachment_ids: z
    .array(z.number().int())
    .min(1, { error: "กรุณาแนบรูปภาพอย่างน้อย 1 รูป" })
    .max(4, { error: "แนบรูปได้สูงสุด 4 รูป" }),
  location: z
    .string()
    .trim()
    .min(2, { error: "กรุณาระบุตำแหน่ง เช่น อาคาร ชั้น ห้อง" })
    .max(200, { error: "ตำแหน่งต้องไม่เกิน 200 ตัวอักษร" }),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  title: titleSchema,
  content: contentSchema,
});
export type RepairFormValues = z.infer<typeof repairFormSchema>;

/** Fields validated per step of the 3-step wizard. */
export const REPAIR_STEP_FIELDS = [
  ["attachment_ids"],
  ["location", "latitude", "longitude"],
  ["title", "content"],
] as const satisfies ReadonlyArray<ReadonlyArray<keyof RepairFormValues>>;

/** Technician updates: optional note (+ after-repair photos when sending for review). */
export const repairNoteSchema = z.object({
  note: z.string().trim().max(500, { error: "บันทึกต้องไม่เกิน 500 ตัวอักษร" }).optional(),
  attachment_ids: z.array(z.number().int()).max(4),
});
export type RepairNoteValues = z.infer<typeof repairNoteSchema>;

/** Reject / send back: the reason is mandatory (min 3 characters, same as the API). */
export const REASON_MIN_LENGTH = 3;
export const repairReasonSchema = z.object({
  note: z
    .string()
    .trim()
    .min(REASON_MIN_LENGTH, { error: "กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร" })
    .max(500, { error: "เหตุผลต้องไม่เกิน 500 ตัวอักษร" }),
});

export const assignSchema = z.object({
  technician_id: z.number({ error: "กรุณาเลือกช่าง" }).int().positive({ error: "กรุณาเลือกช่าง" }),
});
export type AssignValues = z.infer<typeof assignSchema>;
