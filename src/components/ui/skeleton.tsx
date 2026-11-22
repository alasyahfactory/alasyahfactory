import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="status"
      aria-label="جاري التحميل"
      className={cn("animate-pulse rounded-md bg-slate-200/80", className)}
      {...props}
    >
      <span className="sr-only">جاري التحميل...</span>
    </div>
  );
}

export { Skeleton };
