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
    | "purple"
    | "sky";
  withDot?: boolean;
}

function Badge({ className, variant = "default", withDot = false, children, ...props }: BadgeProps) {
  const variantStyles = {
    default: "bg-slate-900 text-white border-transparent shadow-sm",
    secondary: "bg-slate-100 text-slate-800 border-slate-200/80",
    destructive: "bg-rose-50 text-rose-700 border-rose-200/80 font-semibold",
    outline: "text-slate-700 border-slate-200/90 bg-white shadow-subtle",
    emerald: "bg-emerald-50/90 text-emerald-700 border-emerald-200/70 font-semibold",
    amber: "bg-amber-50/90 text-amber-700 border-amber-200/70 font-semibold",
    rose: "bg-rose-50/90 text-rose-700 border-rose-200/70 font-semibold",
    purple: "bg-indigo-50/90 text-indigo-700 border-indigo-200/70 font-semibold",
    sky: "bg-sky-50/90 text-sky-700 border-sky-200/70 font-semibold",
  };

  const dotColors: Record<string, string> = {
    default: "bg-white",
    secondary: "bg-slate-500",
    destructive: "bg-rose-500",
    outline: "bg-slate-400",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    purple: "bg-indigo-500",
    sky: "bg-sky-500",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 tabular-nums select-none",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {withDot && (
        <span className={cn("badge-dot", dotColors[variant] || "bg-current")} />
      )}
      {children}
    </div>
  );
}

export { Badge };
