import { useCallback, useEffect, useRef, useState } from "react";
import { mergeChatMessages } from "@/lib/teamChatState";

// The subscription belongs to the layout, so changing modules never disconnects it.
export default function useTeamChat(client, userId) {
  const [channels, setChannels] = useState([]),
    [roster, setRoster] = useState([]),
    [messages, setMessages] = useState({}),
    [connection, setConnection] = useState("Conectando…");
  const [revision, setRevision] = useState(0);
  const allowed = useRef(new Set()),
    alive = useRef(true);
  const merge = useCallback(
    (items) =>
      setMessages((previous) => {
        const next = { ...previous };
        for (const item of items)
          if (allowed.current.has(item.channelId))
            next[item.channelId] = mergeChatMessages(
              next[item.channelId] || [],
              [item],
            );
        return next;
      }),
    [],
  );
  const receiveChannels = useCallback((rows) => {
    allowed.current = new Set(rows.map((c) => c.id));
    setChannels(rows);
    setMessages((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([id]) => allowed.current.has(id)),
      ),
    );
  }, []);
  const refresh = useCallback(async () => {
    const rows = await client.request("/channels");
    if (alive.current) receiveChannels(rows);
  }, [client, receiveChannels]);
  useEffect(() => {
    alive.current = true;
    let stopped = false,
      cursor = null,
      timer;
    const abort = new AbortController();
    const run = async () => {
      let failures = 0;
      while (!stopped) {
        try {
          await client.stream({
            after: cursor,
            signal: abort.signal,
            onEvent: (event) => {
              if (stopped) return;
              if (event.type === "expired") {
                setConnection("Sesión vencida");
                setMessages({});
                setChannels([]);
                stopped = true;
                abort.abort();
                return;
              }
              if (event.type === "retry") {
                setConnection("Reconectando…");
                return;
              }
              cursor = event.cursor;
              setConnection("Conectado");
              failures = 0;
              receiveChannels(event.channels);
              if (event.type === "ready") setRevision((r) => r + 1);
              else
                merge(
                  (event.events || []).map((e) => e.message).filter(Boolean),
                );
            },
          });
        } catch (error) {
          if (stopped) break;
          console.error("[TeamChat connection]", error.message);
          if (error.status === 401 || error.status === 403) {
            setConnection("Sesión vencida");
            setMessages({});
            setChannels([]);
            break;
          }
        }
        if (!stopped) {
          setConnection("Reconectando…");
          await new Promise((resolve) => {
            const finish = () => {
              clearTimeout(timer);
              abort.signal.removeEventListener("abort", finish);
              resolve();
            };
            timer = setTimeout(
              finish,
              Math.min(15000, 1000 * 2 ** Math.min(failures++, 4)),
            );
            abort.signal.addEventListener("abort", finish, { once: true });
          });
        }
      }
    };
    void run();
    client
      .request("/roster")
      .then((rows) => {
        if (!stopped) setRoster(rows);
      })
      .catch((error) => console.error("[TeamChat roster]", error.message));
    return () => {
      alive.current = false;
      stopped = true;
      clearTimeout(timer);
      abort.abort();
    };
  }, [client, userId, receiveChannels, merge]);
  return { channels, roster, messages, connection, revision, merge, refresh };
}
