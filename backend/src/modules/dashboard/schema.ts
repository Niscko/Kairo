import { z } from "zod";

export const dashboardQuerySchema = z.object({
  /** Días hacia atrás para la serie de ventas. */
  dias: z.coerce.number().int().min(1).max(90).default(7),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
