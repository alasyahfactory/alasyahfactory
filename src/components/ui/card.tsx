import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Material Design 3 (M3) Card System
 * Single Source of Truth: references/component-selection.md & references/shape-and-elevation.md
 *
 * M3 Card Variants:
 * - elevated: Elevation 1 surface with subtle shadow and border (best for KPIs, summaries, standalone hero units)
 * - filled: Surface container highest without prominent elevation (best for grouped form sections and dashboards)
 * - outlined: Clean 1px border grouping with zero shadow (best for table containers, repeating lists)
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "elevated" | "filled" | "outlined";
  interactive?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "outlined", interactive = false, ...props }, ref) => {
    const variantStyles = {
      elevated:
        "border border-slate-100/80 bg-white text-industrial-primary shadow-sm hover:shadow-md transition-shadow duration-200",
      filled:
        "border border-slate-200/50 bg-slate-50/90 text-industrial-primary shadow-none",
      outlined:
        "border border-industrial-border bg-white text-industrial-primary shadow-none",
    };

    const interactiveStyles = interactive
      ? "cursor-pointer transition-all duration-200 hover:border-slate-300 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]"
      : "";

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-2xl transition-all duration-200",
          variantStyles[variant],
          interactiveStyles,
          className
        )}
        {...props}
      />
    );
  }
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-5 sm:p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight text-industrial-primary",
      className
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-xs sm:text-sm text-slate-500", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-5 sm:p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-5 sm:p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
