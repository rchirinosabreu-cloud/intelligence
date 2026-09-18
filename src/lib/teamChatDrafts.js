const prefix = "brain.chat.drafts.";
export const writeChatUi = (userId, state) =>
  writeChatDrafts(`${userId}:ui`, state);
export const readChatUi = (userId) => {
  const state = readChatDrafts(`${userId}:ui`);
  return {
    open: state.open === true,
    mode: ["floating", "expanded", "docked"].includes(state.mode)
      ? state.mode
      : "floating",
    channelId:
      typeof state.channelId === "string" ? state.channelId : "general",
    position: state.position || null,
    // Sound is opt-out and off only when the person asked for it.
    muted: state.muted === true,
  };
};
export function changeChatDraft(draft, patch) {
  if (draft.pending)
    throw new Error(
      "Hay un envío pendiente de confirmar. Reinténtalo antes de cambiarlo.",
    );
  return { ...draft, ...patch };
}
export function prepareChatSend(draft, requestId) {
  if (draft.pending) return draft;
  return {
    ...draft,
    pending: {
      requestId,
      content: draft.content || "",
      format: "HTML",
      attachmentIds: (draft.files || []).map((f) => f.upload.id),
      replyToId: draft.reply?.id || null,
    },
  };
}
let opened;
const database = () =>
  (opened ||= new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(
        new Error("No se puede conservar el archivo después de recargar."),
      );
      return;
    }
    const request = indexedDB.open("brain-chat-files", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
export const readChatDrafts = (userId) => {
  try {
    const value = JSON.parse(sessionStorage.getItem(prefix + userId) || "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch (error) {
    console.error("[TeamChat drafts] read:", error.message);
    return {};
  }
};
export const writeChatDrafts = (userId, drafts) => {
  try {
    sessionStorage.setItem(prefix + userId, JSON.stringify(drafts));
  } catch (error) {
    console.error("[TeamChat drafts] save:", error.message);
  }
};
export async function saveChatFile(userId, id, file) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(file, `${userId}:${id}`);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
export async function loadChatFile(userId, id) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction("files")
      .objectStore("files")
      .get(`${userId}:${id}`);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function removeChatFile(userId, id) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").delete(`${userId}:${id}`);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
export function clearChatDrafts() {
  if (typeof sessionStorage !== "undefined")
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith(prefix)) sessionStorage.removeItem(key);
  if (globalThis.indexedDB)
    void database()
      .then((db) => {
        const tx = db.transaction("files", "readwrite");
        tx.objectStore("files").clear();
        tx.onerror = () => console.error("[TeamChat drafts] clear:", tx.error);
      })
      .catch((error) =>
        console.error("[TeamChat drafts] clear:", error.message),
      );
}
