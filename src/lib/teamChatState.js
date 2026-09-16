export const CHAT_MAX_FILES = 10;
export const CHAT_FILE_BYTES = 100 * 1024 * 1024;
export const CHAT_BATCH_BYTES = 250 * 1024 * 1024;
export const CHAT_DOCK_MIN_WIDTH = 1280;
export const isChatDockTarget = ({ x, width, moved }) =>
  Boolean(
    moved && width >= CHAT_DOCK_MIN_WIDTH && x >= width - 24 && x <= width,
  );
export const chatFloatingRight = (x, width) =>
  Math.max(
    16,
    Math.min(width - x - 56, width - Math.min(420, width - 32) - 16),
  );
export function mergeChatMessages(previous, incoming) {
  const map = new Map(previous.map((m) => [m.id, m]));
  for (const message of incoming)
    if (
      !map.has(message.id) ||
      Number(message.version) >= Number(map.get(message.id).version)
    )
      map.set(message.id, message);
  for (const [id, message] of map) {
    const parent = map.get(message.reply?.id);
    if (parent && (parent.deletedAt || typeof parent.text === "string"))
      map.set(id, {
        ...message,
        reply: {
          ...message.reply,
          text: parent.deletedAt
            ? "Mensaje eliminado"
            : parent.text.slice(0, 220),
        },
      });
  }
  return [...map.values()].sort(
    (a, b) =>
      String(a.createdAt).localeCompare(String(b.createdAt)) ||
      a.id.localeCompare(b.id),
  );
}
export const chatDockWidth = ({ open, mode, width }) =>
  open && mode === "docked" && width >= CHAT_DOCK_MIN_WIDTH ? 360 : 0;
export const clampChatPosition = (position, width, height) => ({
  x: Math.max(16, Math.min(Number(position?.x) || width - 76, width - 72)),
  y: Math.max(80, Math.min(Number(position?.y) || height - 90, height - 88)),
});
export function createChatEventParser(onEvent) {
  let pending = "";
  return (chunk) => {
    pending = (pending + chunk).replace(/\r\n/g, "\n");
    let end;
    while ((end = pending.indexOf("\n\n")) >= 0) {
      const frame = pending.slice(0, end);
      pending = pending.slice(end + 2);
      const data = frame
        .split("\n")
        .filter((s) => s.startsWith("data:"))
        .map((s) => s.slice(5).trim())
        .join("\n");
      if (data) onEvent(JSON.parse(data));
    }
    if (pending.length > 2 * 1024 * 1024)
      throw new Error("Respuesta de chat demasiado grande.");
  };
}
export function formatChatFileSize(bytes) {
  const size = Math.max(0, Number(bytes) || 0);
  const megabytes = size >= 1024 * 1024;
  const value = size === 0 ? 0 : Math.max(0.1, size / (megabytes ? 1024 * 1024 : 1024));
  return `${value.toLocaleString("es-CO", { maximumFractionDigits: 1 })} ${megabytes ? "MB" : "KB"}`;
}
