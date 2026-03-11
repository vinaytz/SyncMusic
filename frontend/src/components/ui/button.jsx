import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all cursor-pointer disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4",
  {
    variants: {
      variant: {
        default: "bg-white text-zinc-900 shadow-sm hover:bg-zinc-100",
        primary: "bg-violet-600 text-white hover:bg-violet-700 shadow-md shadow-violet-500/20",
        outline: "border border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-white",
        ghost: "text-zinc-400 hover:bg-zinc-800 hover:text-white",
        destructive: "bg-red-600 text-white hover:bg-red-700",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({ className, variant, size, ...props }) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
