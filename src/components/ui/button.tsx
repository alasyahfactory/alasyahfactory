import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Material Design 3 (M3) Button System
 * Single Source of Truth: references/component-selection.md & references/shape-and-elevation.md
 *
 * M3 Action Hierarchy:
 * - filled: Highest-emphasis primary action (M3 Filled Button)
 * - tonal: Important but softer secondary action (M3 Filled Tonal Button)
 * - elevated: Medium-emphasis with elevation separation (M3 Elevated Button)
 * - outlined: Medium-emphasis bordered alternative (M3 Outlined Button)
 * - text: Low-emphasis contextual action (M3 Text Button)
 */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    // Material Design 3 Standard Variants
    | "filled"
    | "tonal"
    | "elevated"
    | "outlined"
    | "text"
    // Legacy / Specialized Variants
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link"
    | "accent"
    | "emerald";
  size?: "default" | "sm" | "lg" | "icon" | "mobile";
  shape?: "rounded" | "pill" | "square";
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      shape = "rounded",
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    // M3 Base state layer and interactive transitions
    const baseStyles =
      "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 select-none active:scale-[0.98]";

    const shapeStyles = {
      rounded: "rounded-xl",
      pill: "rounded-full",
      square: "rounded-md",
    };

    const variantStyles: Record<string, string> = {
      // M3 Official Variants
      filled:
        "bg-industrial-primary text-white hover:bg-slate-800 shadow-sm hover:shadow hover:brightness-105 active:shadow-none",
      tonal:
        "bg-sky-50 text-sky-900 border border-sky-100/80 hover:bg-sky-100 hover:border-sky-200 active:bg-sky-200/80",
      elevated:
        "bg-white text-slate-800 border border-slate-100 shadow-sm hover:shadow-md hover:bg-slate-50/80 active:shadow-sm",
      outlined:
        "border border-slate-300 bg-white/50 text-slate-800 hover:bg-slate-100 hover:text-slate-900 hover:border-slate-400 active:bg-slate-200/60",
      text:
        "text-slate-700 hover:bg-slate-100/80 hover:text-slate-900 active:bg-slate-200/70",

      // Legacy Mappings
      default:
        "bg-industrial-primary text-white hover:bg-slate-800 shadow-sm hover:shadow hover:brightness-105 active:shadow-none",
      destructive:
        "bg-rose-600 text-white hover:bg-rose-700 shadow-sm hover:shadow active:bg-rose-800",
      outline:
        "border border-industrial-border bg-white text-slate-800 hover:bg-slate-50 hover:text-slate-900",
      secondary:
        "bg-slate-100 text-slate-900 hover:bg-slate-200 active:bg-slate-300",
      ghost:
        "hover:bg-slate-100 text-slate-700 hover:text-slate-900 active:bg-slate-200",
      link:
        "text-accent underline-offset-4 hover:underline",
      accent:
        "bg-accent text-white hover:bg-sky-700 shadow-sm hover:shadow active:bg-sky-800",
      emerald:
        "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm hover:shadow active:bg-emerald-800",
    };

    const sizeStyles = {
      default: "h-10 px-4 py-2",
      sm: "h-8 px-3 text-xs",
      lg: "h-12 px-8 text-base font-semibold",
      icon: "h-10 w-10 p-0 rounded-full",
      mobile: "min-h-[48px] px-5 py-3 text-base font-semibold w-full",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          baseStyles,
          shapeStyles[size === "icon" ? "pill" : shape],
          variantStyles[variant] || variantStyles.default,
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {isLoading && (
          <Loader2 className="me-2 h-4 w-4 animate-spin text-current" />
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button };
