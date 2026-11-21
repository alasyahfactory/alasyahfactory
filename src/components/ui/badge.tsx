import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?:
    | "default"
    | "secondary"
    | "destructive"
    | "outline"
    | "emerald"
    | "amber"
    | "rose"
    | "purple";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variantStyles = {
    default: "bg-industrial-primary text-white border-transparent",
    secondary: "bg-slate-100 text-slate-800 border-transparent",
    destructive: "bg-rose-100 text-rose-800 border-rose-200",
    outline: "text-slate-800 border-slate-300",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold",
    amber: "bg-amber-50 text-amber-700 border-amber-200 font-semibold",
    rose: "bg-rose-50 text-rose-700 border-rose-200 font-semibold",
    purple: "bg-purple-50 text-purple-700 border-purple-200 font-semibold",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 tabular-nums",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
