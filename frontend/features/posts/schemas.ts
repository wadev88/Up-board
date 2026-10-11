import { z } from "zod";

export const prioritySchema = z.enum(["low", "normal", "high", "urgent"]);
export const eventPrioritySchema = z.enum(["department", "faculty", "university"]);

export const titleSchema = z
  .string()
  .trim()
  .min(3, { error: "หัวข้อต้องมีอย่างน้อย 3 ตัวอักษร" })
  .max(150, { error: "หัวข้อต้องไม่เกิน 150 ตัวอักษร" });

export const contentSchema = z
  .string()
  .trim()
  .min(1, { error: "กรุณากรอกรายละเอียด" })
  .max(5000, { error: "รายละเอียดต้องไม่เกิน 5,000 ตัวอักษร" });

/** General posts, announcements and events (repairs / lost & found have their own forms). */
export const postFormSchema = z
  .object({
    type: z.enum(["general", "announcement", "event"]),
    title: titleSchema,
    content: contentSchema,
    priority: prioritySchema,
    /** datetime-local strings (browser local time) */
    event_starts_at: z.string().optional(),
    event_ends_at: z.string().optional(),
    event_venue: z.string().trim().max(200, { error: "สถานที่ต้องไม่เกิน 200 ตัวอักษร" }).optional(),
    event_priority: eventPrioritySchema,
    /** announcements only: post id of the related repair (0 = none) */
    related_repair_id: z.number().int().min(0),
    attachment_ids: z.array(z.number().int()).max(4, { error: "แนบรูปได้สูงสุด 4 รูป" }),
  })
  .superRefine((v, ctx) => {
    if (v.type !== "event") return;
    // BR-01: both times are required and the end must be after the start (the API re-checks)
    if (!v.event_starts_at) {
      ctx.addIssue({ code: "custom", path: ["event_starts_at"], message: "กรุณาระบุวันเวลาเริ่มกิจกรรม" });
    }
    if (!v.event_ends_at) {
      ctx.addIssue({ code: "custom", path: ["event_ends_at"], message: "กรุณาระบุวันเวลาสิ้นสุดกิจกรรม" });
    }
    if (v.event_starts_at && v.event_ends_at && new Date(v.event_ends_at) <= new Date(v.event_starts_at)) {
      ctx.addIssue({
        code: "custom",
        path: ["event_ends_at"],
        message: "เวลาสิ้นสุดต้องหลังเวลาเริ่ม",
      });
    }
  });
export type PostFormValues = z.infer<typeof postFormSchema>;
