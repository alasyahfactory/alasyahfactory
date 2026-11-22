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
          "flex h-10 w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-900 shadow-subtle transition-all duration-150 file:border-0 file:bg-transparent file:text-xs file:font-semibold placeholder:text-slate-400 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/20 focus-visible:border-sky-500 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-rose-500 aria-[invalid=true]:focus-visible:ring-rose-500/20",
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
