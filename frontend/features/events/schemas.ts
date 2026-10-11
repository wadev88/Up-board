import { z } from "zod";

export const eventInputSchema = z.object({
  starts_at: z.string().min(1),
  ends_at: z.string().nullable().optional(),
  venue: z.string().nullable().optional(),
});
