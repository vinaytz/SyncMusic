import { cn } from "@/lib/utils";

function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-zinc-100",
        className
      )}
      {...props}
    />
  );
}

export { Input };
