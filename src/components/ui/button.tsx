import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link"
    | "accent"
    | "emerald";
  size?: "default" | "sm" | "lg" | "icon" | "mobile";
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none active:scale-[0.98]";

    const variantStyles = {
      default:
        "bg-industrial-primary text-white hover:bg-slate-800 shadow-sm",
      destructive:
        "bg-rose-600 text-white hover:bg-rose-700 shadow-sm",
      outline:
        "border border-industrial-border bg-white text-slate-800 hover:bg-slate-50 hover:text-slate-900",
      secondary:
        "bg-slate-100 text-slate-900 hover:bg-slate-200",
      ghost:
        "hover:bg-slate-100 text-slate-700 hover:text-slate-900",
      link:
        "text-accent underline-offset-4 hover:underline",
      accent:
        "bg-accent text-white hover:bg-sky-700 shadow-sm",
      emerald:
        "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
    };

    const sizeStyles = {
      default: "h-9 px-4 py-2",
      sm: "h-8 rounded-md px-3 text-xs",
      lg: "h-10 rounded-md px-8",
      icon: "h-9 w-9",
      mobile: "min-h-[48px] px-5 py-3 text-base font-semibold w-full",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
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
