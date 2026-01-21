import { cn } from "../lib/utils.js";

export default function ChatMessage({ message }) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "max-w-[80%] rounded-2xl border px-4 py-3 text-sm leading-relaxed",
        isUser
          ? "ml-auto border-ink/10 bg-white"
          : "border-ink/10 bg-white/70"
      )}
    >
      <p className="whitespace-pre-wrap">{message.content}</p>
      <span className="mt-2 block text-xs text-ink/50">{message.timestamp}</span>
    </div>
  );
}
