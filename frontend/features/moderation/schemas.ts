import { z } from "zod";

/** Backend limit for report `detail` and moderation `note`. */
export const REPORT_TEXT_MAX = 1000;

export const reportReasonSchema = z.enum([
  "profanity",
  "spam",
  "harassment",
  "misinformation",
  "other",
]);

export const createReportSchema = z
  .object({
    reason: reportReasonSchema,
    detail: z
      .string()
      .trim()
      .max(REPORT_TEXT_MAX, { error: `รายละเอียดต้องไม่เกิน ${REPORT_TEXT_MAX.toLocaleString("en-US")} ตัวอักษร` })
      .optional(),
  })
  .refine((v) => v.reason !== "other" || (v.detail && v.detail.length > 0), {
    path: ["detail"],
    error: "กรุณาระบุรายละเอียดเมื่อเลือก “อื่น ๆ”",
  });
export type CreateReportValues = z.infer<typeof createReportSchema>;

export const reportStatusSchema = z.enum([
  "reported",
  "under_review",
  "upheld",
  "content_removed",
  "dismissed",
]);

export const reportActionSchema = z.object({
  status: reportStatusSchema,
  note: z
    .string()
    .trim()
    .max(REPORT_TEXT_MAX, { error: `บันทึกต้องไม่เกิน ${REPORT_TEXT_MAX.toLocaleString("en-US")} ตัวอักษร` })
    .optional(),
});
export type ReportActionValues = z.infer<typeof reportActionSchema>;
