import axios from "axios";
import { getApiBaseUrl } from "./apiBaseUrl";
import { createChatEventParser } from "./teamChatState";

export function createTeamChatClient(
  base = getApiBaseUrl(),
  token = () => localStorage.getItem("authToken"),
) {
  const headers = () => ({ Authorization: `Bearer ${token() || ""}` });
  const request = async (path, options = {}) => {
    const response = await fetch(`${base}/api/team-chat${path}`, {
      ...options,
      headers: {
        ...headers(),
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const result = await response.json();
    if (!response.ok) {
      console.error("[TeamChat API]", result);
      throw Object.assign(
        new Error(result.error || "No se pudo completar la operación."),
        { status: response.status },
      );
    }
    return result;
  };
  return {
    request,
    upload: async (channelId, file, requestId, onProgress, signal) => {
      const data = new FormData();
      data.append("requestId", requestId);
      data.append("file", file);
      try {
        const response = await axios.post(
          `${base}/api/team-chat/channels/${channelId}/uploads`,
          data,
          {
            headers: headers(),
            signal,
            onUploadProgress: (e) =>
              onProgress(
                Math.round((100 * e.loaded) / (e.total || file.size || 1)),
              ),
          },
        );
        return response.data;
      } catch (error) {
        console.error(
          "[TeamChat upload]",
          error.response?.data || error.message,
        );
        throw new Error(
          error.response?.data?.error ||
            (signal?.aborted
              ? "Carga cancelada. Puedes reintentar."
              : "La carga falló. Conservamos el archivo para reintentar."),
        );
      }
    },
    media: async (messageId, attachmentId) => {
      const result = await request(
        `/messages/${messageId}/attachments/${attachmentId}/access`,
        { method: "POST" },
      );
      if (!result.url.startsWith("/api/team-chat-media/"))
        throw new Error("Destino de archivo inválido.");
      return { ...result, url: `${base}${result.url}` };
    },
    async stream({ after, signal, onEvent }) {
      const response = await fetch(
        `${base}/api/team-chat/events${after !== null ? `?after=${encodeURIComponent(after)}` : ""}`,
        { headers: headers(), signal },
      );
      if (!response.ok) {
        const result = await response.json();
        console.error("[TeamChat stream]", result);
        throw Object.assign(
          new Error(result.error || "No se pudo conectar el chat."),
          { status: response.status },
        );
      }
      const reader = response.body.getReader(),
        decoder = new TextDecoder(),
        parse = createChatEventParser(onEvent);
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parse(decoder.decode(value, { stream: true }));
        }
      } finally {
        reader.releaseLock();
      }
    },
  };
}
