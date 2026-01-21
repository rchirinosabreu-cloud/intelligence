export const formatTimestamp = (date) =>
  new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

export const buildMessage = (role, content) => ({
  id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  role,
  content,
  timestamp: formatTimestamp(new Date()),
});
