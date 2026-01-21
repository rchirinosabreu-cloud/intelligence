export default function Toast({ message }) {
  return (
    <div className="rounded-xl bg-white/90 px-4 py-3 text-xs text-ink shadow-chat">
      {message}
    </div>
  );
}
