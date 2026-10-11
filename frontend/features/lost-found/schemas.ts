import { z } from "zod";
import { contentSchema, titleSchema } from "@/features/posts/schemas";

export const lostFoundFormSchema = z.object({
  status: z.enum(["lost", "found"]),
  title: titleSchema,
  content: contentSchema,
  location: z
    .string()
    .trim()
    .min(2, { error: "กรุณาระบุสถานที่" })
    .max(200, { error: "สถานที่ต้องไม่เกิน 200 ตัวอักษร" }),
  /** datetime-local string, optional */
  occurred_at: z.string().optional(),
  attachment_ids: z.array(z.number().int()).max(4, { error: "แนบรูปได้สูงสุด 4 รูป" }),
});
export type LostFoundFormValues = z.infer<typeof lostFoundFormSchema>;

export const lostFoundStatusSchema = z.enum(["lost", "found", "returned"]);
