import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  tabularNums?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, tabularNums, inputMode, ...props }, ref) => {
    // Modern Web Guidance: Provide decimal keypad on mobile for number inputs
    const resolvedInputMode = inputMode || (type === "number" ? "decimal" : undefined);

    return (
      <input
        type={type}
        inputMode={resolvedInputMode}
        className={cn(
          "flex h-9 w-full rounded-md border border-industrial-border bg-white px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-rose-500 aria-[invalid=true]:focus-visible:ring-rose-500",
          tabularNums && "tabular-nums font-mono",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
