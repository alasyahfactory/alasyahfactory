import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 2026 Industrial Enterprise Button System
 * Built on Material Design 3 + Swiss Minimalism
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
    // 2026 Interactive transitions with tactile feedback
    const baseStyles =
      "inline-flex items-center justify-center whitespace-nowrap text-xs font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 select-none active:scale-[0.975] cursor-pointer";

    const shapeStyles = {
      rounded: "rounded-xl",
      pill: "rounded-full",
      square: "rounded-lg",
    };

    const variantStyles: Record<string, string> = {
      // 2026 Core Variants
      filled:
        "bg-slate-900 text-white hover:bg-slate-800 shadow-sm shadow-slate-900/10 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-none",
      tonal:
        "bg-sky-50 text-sky-900 border border-sky-200/70 hover:bg-sky-100/80 hover:border-sky-300 active:bg-sky-200/80",
      elevated:
        "bg-white text-slate-800 border border-slate-200/80 shadow-sm hover:shadow-md hover:bg-slate-50/80 hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm",
      outlined:
        "border border-slate-200/90 bg-white text-slate-800 hover:bg-slate-50 hover:text-slate-950 hover:border-slate-300 shadow-subtle active:bg-slate-100",
      text:
        "text-slate-700 hover:bg-slate-100/80 hover:text-slate-900 active:bg-slate-200/70",

      // Semantic Variants
      default:
        "bg-slate-900 text-white hover:bg-slate-800 shadow-sm shadow-slate-900/10 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-none",
      destructive:
        "bg-rose-600 text-white hover:bg-rose-700 shadow-sm shadow-rose-600/20 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:bg-rose-800",
      outline:
        "border border-slate-200/90 bg-white text-slate-800 hover:bg-slate-50 hover:text-slate-950 hover:border-slate-300 shadow-subtle active:bg-slate-100",
      secondary:
        "bg-slate-100 text-slate-800 hover:bg-slate-200/80 hover:text-slate-950 active:bg-slate-200",
      ghost:
        "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 active:bg-slate-200/70",
      link:
        "text-sky-600 underline-offset-4 hover:underline p-0 h-auto font-medium",
      accent:
        "bg-gradient-to-r from-sky-600 to-sky-700 text-white hover:from-sky-700 hover:to-sky-800 shadow-sm shadow-sky-600/20 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0",
      emerald:
        "bg-gradient-to-r from-emerald-600 to-emerald-700 text-white hover:from-emerald-700 hover:to-emerald-800 shadow-sm shadow-emerald-600/20 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0",
    };

    const sizeStyles = {
      default: "h-9 px-4 py-2",
      sm: "h-8 px-3 text-xs",
      lg: "h-11 px-6 text-sm font-semibold",
      icon: "h-9 w-9 p-0",
      mobile: "min-h-[48px] px-5 py-3 text-sm font-semibold w-full",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          baseStyles,
          shapeStyles[size === "icon" ? "rounded" : shape],
          variantStyles[variant] || variantStyles.default,
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {isLoading && (
          <Loader2 className="me-2 h-3.5 w-3.5 animate-spin text-current" />
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button };
