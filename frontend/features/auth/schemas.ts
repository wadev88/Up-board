import { z } from "zod";
import { UP_EMAIL_DOMAIN } from "@/lib/constants";

export const upEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, { error: "กรุณากรอกอีเมล" })
  .pipe(
    z
      .email({ error: "รูปแบบอีเมลไม่ถูกต้อง" })
      .refine((v) => v.endsWith(UP_EMAIL_DOMAIN), {
        error: `ต้องใช้อีเมลมหาวิทยาลัยที่ลงท้ายด้วย ${UP_EMAIL_DOMAIN}`,
      }),
  );

export const loginSchema = z.object({
  email: upEmailSchema,
  password: z.string().min(1, { error: "กรุณากรอกรหัสผ่าน" }),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, { error: "ชื่อที่แสดงต้องมีอย่างน้อย 2 ตัวอักษร" })
  .max(60, { error: "ชื่อที่แสดงต้องไม่เกิน 60 ตัวอักษร" });

export const registerSchema = z
  .object({
    email: upEmailSchema,
    display_name: displayNameSchema,
    password: z
      .string()
      .min(8, { error: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" })
      .max(128, { error: "รหัสผ่านต้องไม่เกิน 128 ตัวอักษร" }),
    confirm_password: z.string().min(1, { error: "กรุณายืนยันรหัสผ่าน" }),
    faculty_id: z
      .number({ error: "กรุณาเลือกคณะ" })
      .int()
      .positive({ error: "กรุณาเลือกคณะ" }),
    program_id: z
      .number({ error: "กรุณาเลือกสาขาวิชา" })
      .int()
      .positive({ error: "กรุณาเลือกสาขาวิชา" }),
  })
  .refine((v) => v.password === v.confirm_password, {
    path: ["confirm_password"],
    error: "รหัสผ่านไม่ตรงกัน",
  });
export type RegisterValues = z.infer<typeof registerSchema>;

const contactField = z.string().trim().max(100, { error: "ต้องไม่เกิน 100 ตัวอักษร" });

/** Profile: name, faculty + program (0 = none, only for accounts that have none) and contacts. */
export const profileSchema = z
  .object({
    display_name: displayNameSchema,
    faculty_id: z.number().int().min(0),
    program_id: z.number().int().min(0),
    contact_facebook: contactField,
    contact_instagram: contactField,
    contact_line: contactField,
  })
  .superRefine((v, ctx) => {
    if (v.faculty_id > 0 && !v.program_id) {
      ctx.addIssue({ code: "custom", path: ["program_id"], message: "กรุณาเลือกสาขาวิชา" });
    }
  });

/** First sign-in: faculty and program are both required. */
export const onboardingSchema = z.object({
  /** 0 = not chosen */
  faculty_id: z.number().int().positive({ error: "กรุณาเลือกคณะ" }),
  program_id: z.number().int().positive({ error: "กรุณาเลือกสาขาวิชา" }),
});
export type OnboardingValues = z.infer<typeof onboardingSchema>;
export type ProfileValues = z.infer<typeof profileSchema>;
