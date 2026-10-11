/**
 * UP addresses: student ids are numeric and start with the 2-digit (Buddhist-era) entry year,
 * e.g. 67024841@up.ac.th entered in 2567; teachers and staff use names (somchai.j@up.ac.th).
 * The API applies the same role rule (services/auth.py role_from_email).
 */

export function roleFromEmail(email: string): "student" | "teacher" {
  return /^\d/.test(email) ? "student" : "teacher";
}
