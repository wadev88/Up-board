import { z } from "zod";

/** Dashboard search box → navigates to /posts?q= */
export const dashboardSearchSchema = z.object({
  q: z.string().trim().min(1).max(100),
});
