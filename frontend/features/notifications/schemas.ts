import { z } from "zod";

/** Validates SSE `notification` payloads before they touch the cache. */
export const notificationSchema = z.object({
  id: z.number(),
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  link: z.string().nullable(),
  read_at: z.string().nullable(),
  created_at: z.string(),
});
