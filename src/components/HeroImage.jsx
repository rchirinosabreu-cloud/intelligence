import { cn } from "../lib/utils.js";

export default function HeroImage({ size = "lg" }) {
  const classes = size === "sm" ? "h-10 w-10" : "h-16 w-16";

  return (
    <div
      className={cn(
        "grid place-items-center rounded-2xl bg-accent text-white",
        classes
      )}
    >
      <span className="text-lg font-semibold">B</span>
    </div>
  );
}
