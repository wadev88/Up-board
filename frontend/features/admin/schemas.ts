import { z } from "zod";
import { FACULTY_REQUIRED_ROLES, UP_EMAIL_DOMAIN } from "@/lib/constants";
import { displayNameSchema } from "@/features/auth/schemas";

export const roleSchema = z.enum([
  "student",
  "teacher",
  "technician",
  "building_staff",
  "student_club",
  "admin",
]);

const technicianField = z.string().trim().max(100, { error: "ต้องไม่เกิน 100 ตัวอักษร" }).optional();

/** Teachers need a faculty; a chosen faculty needs a program (the API checks they match). */
function checkRoleFields(
  v: { role: z.infer<typeof roleSchema>; faculty_id: number; program_id: number },
  ctx: z.RefinementCtx,
) {
  if (FACULTY_REQUIRED_ROLES.includes(v.role) && !v.faculty_id) {
    ctx.addIssue({ code: "custom", path: ["faculty_id"], message: "อาจารย์ต้องสังกัดคณะ" });
  }
  if (v.faculty_id > 0 && !v.program_id) {
    ctx.addIssue({ code: "custom", path: ["program_id"], message: "กรุณาเลือกสาขาวิชา" });
  }
}

export const adminUserSchema = z
  .object({
    role: roleSchema,
    /** 0 = no faculty */
    faculty_id: z.number().int().min(0),
    /** 0 = none */
    program_id: z.number().int().min(0),
    is_active: z.boolean(),
    is_verified: z.boolean(),
    lift_suspension: z.boolean(),
    technician_specialty: technicianField,
    technician_zone: technicianField,
  })
  .superRefine(checkRoleFields);
export type AdminUserValues = z.infer<typeof adminUserSchema>;

/**
 * Admin-created account (building staff, technicians, clubs, admins, ...). No password: the
 * owner signs in with Google using this exact address. @up.ac.th only, except student_club
 * accounts, which may use any valid email (e.g. a club's Gmail).
 */
export const adminCreateUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().min(1, { error: "กรุณากรอกอีเมล" }).pipe(z.email({ error: "รูปแบบอีเมลไม่ถูกต้อง" })),
    display_name: displayNameSchema,
    role: roleSchema,
    faculty_id: z.number().int().min(0),
    program_id: z.number().int().min(0),
    technician_specialty: technicianField,
    technician_zone: technicianField,
  })
  .superRefine((v, ctx) => {
    checkRoleFields(v, ctx);
    if (v.role !== "student_club" && !v.email.endsWith(UP_EMAIL_DOMAIN)) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: `ต้องใช้อีเมลที่ลงท้ายด้วย ${UP_EMAIL_DOMAIN} (ยกเว้นบัญชีชมรม / สโมสร ใช้อีเมลใดก็ได้)`,
      });
    }
  });
export type AdminCreateUserValues = z.infer<typeof adminCreateUserSchema>;

/* ---------- catalog: faculties and programs (never deleted, only deactivated) ---------- */

const nameTh = z.string().trim().min(2, { error: "กรุณากรอกชื่อ (ไทย)" }).max(150, { error: "ต้องไม่เกิน 150 ตัวอักษร" });
const nameEn = z.string().trim().max(150, { error: "ต้องไม่เกิน 150 ตัวอักษร" });
const code = z.string().trim().min(1, { error: "กรุณากรอกรหัส" }).max(30, { error: "ต้องไม่เกิน 30 ตัวอักษร" });

export const facultyCatalogSchema = z.object({ code, name_th: nameTh, name_en: nameEn });
export type FacultyCatalogValues = z.infer<typeof facultyCatalogSchema>;

export const programCatalogSchema = z.object({
  faculty_id: z.number().int().positive({ error: "กรุณาเลือกคณะ" }),
  code,
  name_th: nameTh,
  name_en: nameEn,
});
export type ProgramCatalogValues = z.infer<typeof programCatalogSchema>;
