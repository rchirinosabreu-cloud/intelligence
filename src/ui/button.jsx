import { cn } from "../lib/utils.js";

export default function Button({ className, ...props }) {
  return (
    <button
      className={cn(
        "rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5",
        className
      )}
      {...props}
    />
  );
}
