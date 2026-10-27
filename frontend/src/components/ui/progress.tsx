import * as React from "react";

import { cn } from "@/lib/utils";

/** Barra de progreso con variantes de color según el estado. */
const Progress = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value?: number; variant?: "default" | "success" | "warning" | "destructive" }
>(({ className, value = 0, variant = "default", ...props }, ref) => {
  const variantes = {
    default: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    destructive: "bg-destructive",
  } as const;

  return (
    <div
      ref={ref}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      {...props}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-300", variantes[variant])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
});
Progress.displayName = "Progress";

export { Progress };
