import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-zinc-800 text-zinc-300",
        success: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
        destructive: "bg-red-500/15 text-red-400 border border-red-500/20",
        outline: "border border-zinc-700 text-zinc-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
