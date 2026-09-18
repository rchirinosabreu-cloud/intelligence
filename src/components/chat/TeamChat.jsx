import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  MessageCircle,
  Search,
  X,
  MoreHorizontal,
  ArrowLeft,
  Maximize2,
} from "@/components/ui/icons";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import Select from "@/components/ui/Select";
import { Button } from "@/components/ui/button";
import ChatComposer from "./ChatComposer";
import ChatMessage from "./ChatMessage";
import useTeamChat from "./useTeamChat";
import { createTeamChatClient } from "@/lib/teamChatClient";
import {
  chatDockWidth,
  chatFloatingRight,
  isChatDockTarget,
  CHAT_DOCK_MIN_WIDTH,
  clampChatPosition,
  CHAT_MAX_FILES,
  CHAT_FILE_BYTES,
  CHAT_BATCH_BYTES,
} from "@/lib/teamChatState";
import {
  readChatDrafts,
  readChatUi,
  writeChatUi,
  writeChatDrafts,
  saveChatFile,
  loadChatFile,
  removeChatFile,
  prepareChatSend,
  changeChatDraft,
} from "@/lib/teamChatDrafts";
import { startChatRecording } from "@/lib/teamChatRecording";
import { chatCueForIncoming, playChatCue } from "@/lib/teamChatSound";
import "./teamChat.css";

const button =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-sm hover:bg-muted disabled:opacity-40";
const newDraft = () => ({ content: "", files: [], reply: null });
const failure = (label, error) => {
  console.error(`[TeamChat ${label}]`, error.response?.data || error.message);
  return error.message || "No se pudo completar la operación.";
};
const uid = () => crypto.randomUUID();

export default function TeamChat({
  currentUser,
  blocked = false,
  onDockWidthChange,
  client: providedClient,
}) {
  const client = useMemo(
    () => providedClient || createTeamChatClient(),
    [providedClient],
  );
  // The stream fires outside render, so the cue reads the latest panel state
  // from a ref instead of resubscribing whenever any of it changes.
  const cueState = useRef({
    panelOpen: false,
    muted: false,
    mutedChannels: new Set(),
  });
  const announce = useCallback(
    (incoming) => {
      const cue = chatCueForIncoming({
        ...cueState.current,
        messages: incoming,
        userId: currentUser.id,
      });
      if (cue) playChatCue(cue);
    },
    [currentUser.id],
  );
  const chat = useTeamChat(client, currentUser.id, announce);
  const [initialUi] = useState(() => readChatUi(currentUser.id));
  const [open, setOpen] = useState(initialUi.open),
    [mode, setMode] = useState(initialUi.mode),
    [channelId, setChannelId] = useState(initialUi.channelId);
  const [soundMuted, setSoundMuted] = useState(initialUi.muted);
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.visualViewport?.height || window.innerHeight,
    top: 0,
  });
  const [position, setPosition] = useState(() =>
    clampChatPosition(
      initialUi.position,
      window.innerWidth,
      window.innerHeight,
    ),
  );
  const [dockTarget, setDockTarget] = useState(false),
    [channelsVisible, setChannelsVisible] = useState(false);
  const [query, setQuery] = useState(""),
    [filesOnly, setFilesOnly] = useState(false),
    [searchOpen, setSearchOpen] = useState(false);
  const [results, setResults] = useState(null),
    [before, setBefore] = useState(null),
    [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState("");
  const [drafts, setDrafts] = useState(() => readChatDrafts(currentUser.id)),
    [fileMap, setFileMap] = useState(new Map());
  const [editing, setEditing] = useState(null),
    [editContent, setEditContent] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(null),
    [error, setError] = useState("");
  const [voice, setVoice] = useState({ status: "inactive", seconds: 0 }),
    [recordPending, setRecordPending] = useState(false),
    [voiceFinishing, setVoiceFinishing] = useState(false);
  const [selection, setSelection] = useState([]),
    [dialog, setDialog] = useState(null),
    [dialogBusy, setDialogBusy] = useState(false),
    [dialogError, setDialogError] = useState("");
  const [newMessages, setNewMessages] = useState(false);
  useEffect(
    () =>
      writeChatUi(currentUser.id, {
        open,
        mode,
        channelId,
        position,
        muted: soundMuted,
      }),
    [currentUser.id, open, mode, channelId, position, soundMuted],
  );
  cueState.current = {
    panelOpen: open,
    muted: soundMuted,
    mutedChannels: new Set(
      chat.channels.filter((c) => c.muted).map((c) => c.id),
    ),
  };
  const [jumpTarget, setJumpTarget] = useState(null);
  const draftsRef = useRef(drafts),
    fileRef = useRef(fileMap),
    alive = useRef(true),
    recorder = useRef(null),
    voiceSending = useRef(false),
    sendRef = useRef(null),
    recordingGeneration = useRef(0),
    uploadAbort = useRef(null),
    busyRef = useRef(false),
    drag = useRef(null),
    skipClick = useRef(false);
  const pane = useRef(null),
    bubble = useRef(null),
    list = useRef(null),
    bottom = useRef(true),
    pageGeneration = useRef(0),
    readTimer = useRef(null),
    readCandidate = useRef(null),
    readSent = useRef({}),
    editRequest = useRef(null);
  const selected = chat.channels.find((c) => c.id === channelId);
  const mobile = viewport.width < 768,
    docked =
      chatDockWidth({ open: open && !blocked, mode, width: viewport.width }) >
      0;
  const shown = open && !blocked;
  const draft = drafts[channelId] || newDraft();
  const messages = chat.messages[channelId] || [];
  const visibleMessages =
    results === null
      ? messages
      : messages.filter((m) => results.includes(m.id));
  const unread = chat.channels.reduce((n, c) => n + c.unread, 0);
  const storeDraft = useCallback(
    (id, value) => {
      if (!alive.current) return;
      draftsRef.current = { ...draftsRef.current, [id]: value };
      setDrafts(draftsRef.current);
      writeChatDrafts(currentUser.id, draftsRef.current);
    },
    [currentUser.id],
  );
  useEffect(() => {
    fileRef.current = fileMap;
  }, [fileMap]);
  useEffect(() => {
    alive.current = true;
    for (const d of Object.values(draftsRef.current))
      for (const f of d.files || [])
        if (!f.upload)
          loadChatFile(currentUser.id, f.localId)
            .then((file) => {
              if (file && alive.current) {
                fileRef.current.set(f.localId, file);
                setFileMap(new Map(fileRef.current));
              }
            })
            .catch((e) => console.error("[TeamChat draft file]", e.message));
    return () => {
      alive.current = false;
      recorder.current?.cancel();
      uploadAbort.current?.abort();
      clearTimeout(readTimer.current);
    };
  }, [currentUser.id]);
  useEffect(() => {
    const resize = () => {
      setViewport({
        width: window.innerWidth,
        height: window.visualViewport?.height || window.innerHeight,
        top: window.visualViewport?.offsetTop || 0,
      });
      setPosition((p) =>
        clampChatPosition(p, window.innerWidth, window.innerHeight),
      );
    };
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("scroll", resize);
    return () => {
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("scroll", resize);
    };
  }, []);
  useEffect(() => {
    onDockWidthChange?.(docked ? 360 : 0);
    return () => onDockWidthChange?.(0);
  }, [docked, onDockWidthChange]);
  useEffect(() => {
    if (!shown || !mobile) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, [shown, mobile]);
  useEffect(() => {
    const launch = (e) => {
      const id = e.detail?.channelId || "general";
      setChannelId(id);
      setJumpTarget(e.detail?.messageId || null);
      setOpen(true);
    };
    const params = new URLSearchParams(window.location.search);
    if (params.has("chatChannel"))
      launch({
        detail: {
          channelId: params.get("chatChannel"),
          messageId: params.get("chatMessage"),
        },
      });
    window.addEventListener("open-general-chat", launch);
    return () => window.removeEventListener("open-general-chat", launch);
  }, []);
  useEffect(() => {
    if (!shown || !selected || !jumpTarget) return;
    let canceled = false;
    client
      .request(`/messages/${encodeURIComponent(jumpTarget)}`)
      .then((message) => {
        if (!canceled) {
          setDialog({ type: "message", message });
          setJumpTarget(null);
        }
      })
      .catch((e) => {
        if (!canceled) {
          setError(failure("mentioned message", e));
          setJumpTarget(null);
        }
      });
    return () => {
      canceled = true;
    };
  }, [shown, Boolean(selected), jumpTarget, client]);
  useEffect(() => {
    if (chat.channels.length && !selected) {
      setChannelId("general");
      setEditing(null);
      setError("El canal ya no está disponible para tu cuenta.");
    }
  }, [chat.channels, selected]);
  const loadPage = useCallback(
    async (older = false) => {
      const generation = pageGeneration.current,
        id = channelId,
        oldHeight = list.current?.scrollHeight || 0;
      setLoading(true);
      setLoadError("");
      try {
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        if (filesOnly) params.set("files", "1");
        if (older && before) params.set("before", before);
        const page = await client.request(`/channels/${id}/messages?${params}`);
        if (!alive.current || generation !== pageGeneration.current) return;
        chat.merge(page.messages);
        setBefore(page.before);
        setResults((previous) =>
          query || filesOnly
            ? [
                ...(older ? previous || [] : []),
                ...page.messages.map((m) => m.id),
              ]
            : null,
        );
        requestAnimationFrame(() => {
          if (!list.current) return;
          if (older)
            list.current.scrollTop += list.current.scrollHeight - oldHeight;
          else if (!query && !filesOnly)
            list.current.scrollTop = list.current.scrollHeight;
        });
      } catch (e) {
        if (alive.current && generation === pageGeneration.current)
          setLoadError(failure("history", e));
      } finally {
        if (alive.current && generation === pageGeneration.current)
          setLoading(false);
      }
    },
    [channelId, query, filesOnly, before, client, chat.merge],
  );
  const loadRef = useRef(loadPage);
  loadRef.current = loadPage;
  useEffect(() => {
    pageGeneration.current++;
    setBefore(null);
    setResults(query || filesOnly ? [] : null);
    setLoading(false);
    if (!shown || !selected) return;
    const timer = setTimeout(() => loadRef.current(false), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [channelId, query, filesOnly, shown, chat.revision, Boolean(selected)]);
  useEffect(() => {
    if (!shown) return;
    if (bottom.current && !query && !filesOnly) {
      requestAnimationFrame(() => {
        if (list.current) list.current.scrollTop = list.current.scrollHeight;
      });
      setNewMessages(false);
    } else setNewMessages(true);
  }, [messages.length, shown, query, filesOnly]);
  const close = () => {
    recordingGeneration.current++;
    recorder.current?.stop();
    setOpen(false);
    requestAnimationFrame(() => bubble.current?.focus());
  };
  useEffect(() => {
    if (shown)
      pane.current
        ?.querySelector('[aria-label="Cerrar chat"]')
        ?.focus({ preventScroll: true });
    else {
      recordingGeneration.current++;
      recorder.current?.stop();
    }
  }, [shown]);
  useEffect(() => {
    if (!shown) return;
    const key = (e) => {
      if (
        e.key === "Escape" &&
        !dialog &&
        !document.querySelector("[data-radix-popper-content-wrapper]")
      ) {
        e.preventDefault();
        recordingGeneration.current++;
        recorder.current?.stop();
        setOpen(false);
      }
      if (
        mobile &&
        e.key === "Tab" &&
        !dialog &&
        !document.querySelector("[data-radix-popper-content-wrapper]")
      ) {
        const nodes = [
          ...pane.current.querySelectorAll(
            'button:not(:disabled),input,textarea,[contenteditable=true],[tabindex="0"],a[href]',
          ),
        ].filter((n) => n.offsetParent !== null);
        if (e.shiftKey && document.activeElement === nodes[0]) {
          e.preventDefault();
          nodes.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
          e.preventDefault();
          nodes[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [shown, mobile, dialog]);
  const switchChannel = (id) => {
    if (busyRef.current) return;
    recordingGeneration.current++;
    recorder.current?.stop();
    setChannelId(id);
    setChannelsVisible(false);
    setEditing(null);
    setSelection([]);
    setQuery("");
    setFilesOnly(false);
    setError("");
    bottom.current = true;
  };
  const change = (patch) => {
    if (busyRef.current || voiceSending.current) return;
    if (editing) {
      setEditContent(patch.content ?? editContent);
      editRequest.current = null;
      return;
    }
    try {
      storeDraft(
        channelId,
        changeChatDraft(draftsRef.current[channelId] || newDraft(), patch),
      );
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  const addFiles = async (files, id = channelId) => {
    const d = draftsRef.current[id] || newDraft();
    if (d.pending || busyRef.current) {
      setError("Confirma el envío pendiente antes de añadir archivos.");
      return;
    }
    if (
      d.files.length + files.length > CHAT_MAX_FILES ||
      files.some((f) => !f.size || f.size > CHAT_FILE_BYTES) ||
      d.files.reduce((s, f) => s + f.size, 0) +
        files.reduce((s, f) => s + f.size, 0) >
        CHAT_BATCH_BYTES
    ) {
      setError(
        "Puedes adjuntar 10 archivos, de hasta 100 MB cada uno y 250 MB en total.",
      );
      return;
    }
    const entries = files.map((file) => ({
      localId: uid(),
      requestId: uid(),
      name: file.name,
      size: file.size,
      type: file.type,
    }));
    entries.forEach((entry, i) => fileRef.current.set(entry.localId, files[i]));
    setFileMap(new Map(fileRef.current));
    storeDraft(id, { ...d, files: [...d.files, ...entries] });
    for (const [i, entry] of entries.entries())
      try {
        if (!alive.current) break;
        await saveChatFile(currentUser.id, entry.localId, files[i]);
      } catch (e) {
        setError(
          failure("save draft", e) +
            " Mantén esta pestaña abierta hasta enviar.",
        );
      }
    return entries;
  };
  const record = async () => {
    if (recordPending || draft.pending || busyRef.current || voiceSending.current) return;
    setRecordPending(true);
    setError("");
    const id = channelId;
    const generation = ++recordingGeneration.current;
    try {
      const session = await startChatRecording({
        onState: (v) => {
          if (alive.current) setVoice(v);
        },
        onFile: async (file) => {
          if (alive.current && !(await addFiles([file], id)))
            throw new Error("No se pudo añadir la nota. Revisa los archivos del mensaje antes de grabar otra vez.");
        },
        onError: (e) => setError(failure("voice", e)),
      });
      if (!alive.current || generation !== recordingGeneration.current)
        session.cancel();
      else recorder.current = session;
    } catch (e) {
      setError(failure("microphone", e));
    } finally {
      if (alive.current) setRecordPending(false);
    }
  };
  const send = async ({ recording = null, recordingChannel = null } = {}) => {
    const finishedVoice = recording && recording === recorder.current && recording.state === "inactive";
    if (
      busyRef.current ||
      (recording && (!finishedVoice || recordingChannel !== channelId || editing)) ||
      (voiceSending.current && !finishedVoice) ||
      (!finishedVoice && (voice.status !== "inactive" || recordPending)) ||
      !selected ||
      selected.isArchived
    )
      return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setProgress(null);
    const id = channelId;
    uploadAbort.current = new AbortController();
    try {
      let result;
      if (editing) {
        const payload = editRequest.current || {
          requestId: uid(),
          version: editing.version,
          content: editContent,
          format: "HTML",
        };
        editRequest.current = payload;
        result = await client.request(`/messages/${editing.id}`, {
          method: "PATCH",
          body: payload,
        });
        if (alive.current) {
          setEditing(null);
          editRequest.current = null;
        }
      } else {
        let d = draftsRef.current[id] || newDraft();
        if (!d.pending) {
          for (let i = 0; i < d.files.length; i++)
            if (!d.files[i].upload) {
              const entry = d.files[i],
                file =
                  fileRef.current.get(entry.localId) ||
                  (await loadChatFile(currentUser.id, entry.localId));
              if (!file)
                throw new Error(
                  `Selecciona de nuevo ${entry.name}; el navegador ya no conserva el archivo.`,
                );
              setProgress(0);
              const uploaded = await client.upload(
                id,
                file,
                entry.requestId,
                (p) => {
                  if (alive.current) setProgress(p);
                },
                uploadAbort.current.signal,
              );
              d = {
                ...d,
                files: d.files.map((f) =>
                  f.localId === entry.localId ? { ...f, upload: uploaded } : f,
                ),
              };
              storeDraft(id, d);
            }
          d = prepareChatSend(d, uid());
          storeDraft(id, d);
        }
        setProgress(null);
        result = await client.request(`/channels/${id}/messages`, {
          method: "POST",
          body: d.pending,
        });
        if (alive.current) {
          storeDraft(id, newDraft());
          for (const file of d.files) {
            fileRef.current.delete(file.localId);
            void removeChatFile(currentUser.id, file.localId).catch((e) =>
              console.error("[TeamChat cleanup]", e.message),
            );
          }
          setFileMap(new Map(fileRef.current));
        }
      }
      if (alive.current) {
        chat.merge([result]);
        bottom.current = true;
        requestAnimationFrame(() => {
          if (list.current) list.current.scrollTop = list.current.scrollHeight;
        });
      }
    } catch (e) {
      if (alive.current) {
        setError(failure("send", e));
        if (e.status && e.status < 500) {
          const d = draftsRef.current[id];
          if (d?.pending) {
            const { pending, ...rest } = d;
            storeDraft(id, rest);
          }
          editRequest.current = null;
        }
      }
    } finally {
      busyRef.current = false;
      if (alive.current) {
        setBusy(false);
        setProgress(null);
      }
    }
  };
  sendRef.current = send;
  const sendVoice = async () => {
    const session = recorder.current;
    if (!session || voiceSending.current || busyRef.current) return;
    const generation = recordingGeneration.current;
    const id = channelId;
    voiceSending.current = true;
    setVoiceFinishing(true);
    try {
      const file = await session.stop();
      // Closing or switching channels preserves the recording as a draft.
      // Sending is allowed only after its final chunk and local draft exist.
      if (file && alive.current && generation === recordingGeneration.current)
        await sendRef.current({ recording: session, recordingChannel: id });
    } finally {
      voiceSending.current = false;
      if (alive.current) setVoiceFinishing(false);
    }
  };
  const react = async (message, emoji, active) => {
    try {
      chat.merge([
        await client.request(`/messages/${message.id}/reactions`, {
          method: "PUT",
          body: { requestId: uid(), emoji, active },
        }),
      ]);
    } catch (e) {
      setError(failure("reaction", e));
    }
  };
  const visible = useCallback(
    (message) => {
      if (
        !shown ||
        query ||
        filesOnly ||
        message.author.id === currentUser.id ||
        BigInt(message.sentSeq || 0) <=
          BigInt(readSent.current[message.channelId] || 0)
      )
        return;
      if (
        !readCandidate.current ||
        BigInt(message.sentSeq) > BigInt(readCandidate.current.sentSeq)
      )
        readCandidate.current = message;
      if (readTimer.current) return;
      readTimer.current = setTimeout(async () => {
        readTimer.current = null;
        const m = readCandidate.current;
        readCandidate.current = null;
        if (!m || document.hidden || !document.hasFocus()) return;
        try {
          await client.request(`/channels/${m.channelId}/read`, {
            method: "POST",
            body: { messageId: m.id },
          });
          readSent.current[m.channelId] = m.sentSeq;
          await chat.refresh();
        } catch (e) {
          console.error("[TeamChat read]", e.message);
        }
      }, 700);
    },
    [shown, query, filesOnly, currentUser.id, client, chat.refresh],
  );
  const jump = async (id) => {
    const node = list.current?.querySelector(
      `[data-message-id="${CSS.escape(id)}"]`,
    );
    if (node) {
      node.scrollIntoView({ block: "center" });
      return;
    }
    try {
      const message = await client.request(`/messages/${id}`);
      setDialog({ type: "message", message });
      setDialogError("");
    } catch (e) {
      setError(failure("reply", e));
    }
  };
  const openDialog = async (value) => {
    setDialogError("");
    setDialog({
      ...value,
      loadingMembers: Boolean(
        value.type === "channel" && value.channel?.isPrivate,
      ),
    });
    if (value.type === "channel" && value.channel?.isPrivate)
      try {
        const members = await client.request(
          `/channels/${value.channel.id}/members`,
        );
        setDialog((d) =>
          d?.channel?.id === value.channel.id
            ? { ...d, members, loadingMembers: false }
            : d,
        );
      } catch (e) {
        setDialogError(failure("members", e));
      }
  };
  const saveDialog = async () => {
    if (dialogBusy || dialog.loadingMembers) return;
    setDialogBusy(true);
    setDialogError("");
    try {
      if (dialog.type === "delete")
        chat.merge([
          await client.request(`/messages/${dialog.message.id}`, {
            method: "DELETE",
            body: {
              requestId: dialog.requestId,
              version: dialog.message.version,
            },
          }),
        ]);
      if (dialog.type === "forward") {
        const results = await client.request(
          `/channels/${dialog.target}/forward`,
          {
            method: "POST",
            body: { requestId: dialog.requestId, messageIds: dialog.ids },
          },
        );
        chat.merge(results);
        setSelection([]);
      }
      if (dialog.type === "channel") {
        const payload = { requestId: dialog.requestId, name: dialog.name };
        if (dialog.channel) {
          payload.version = dialog.channel.version;
          payload.isArchived = dialog.archived;
        } else payload.isPrivate = dialog.private;
        if (dialog.private) payload.memberIds = dialog.members;
        await client.request(
          dialog.channel ? `/channels/${dialog.channel.id}` : "/channels",
          { method: dialog.channel ? "PATCH" : "POST", body: payload },
        );
        await chat.refresh();
      }
      setDialog(null);
    } catch (e) {
      setDialogError(failure("action", e));
    } finally {
      setDialogBusy(false);
    }
  };
  const forward = (ids) =>
    openDialog({ type: "forward", ids, target: "", requestId: uid() });
  const beginDrag = (event, kind) => {
    // React portals bubble through their owner; menu items are not drag handles.
    if (!event.currentTarget.contains(event.target)) return;
    if (
      event.button !== 0 ||
      (event.target.closest("button,input,[role=menuitem]") &&
        kind !== "bubble")
    )
      return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      kind,
      x: event.clientX,
      y: event.clientY,
      start: position,
      moved: false,
    };
  };
  const moveDrag = (event) => {
    const d = drag.current;
    if (!d) return;
    if (Math.hypot(event.clientX - d.x, event.clientY - d.y) > 6)
      d.moved = true;
    if (d.moved && d.kind === "bubble")
      setPosition(
        clampChatPosition(
          {
            x: d.start.x + event.clientX - d.x,
            y: d.start.y + event.clientY - d.y,
          },
          viewport.width,
          viewport.height,
        ),
      );
    setDockTarget(
      isChatDockTarget({
        x: event.clientX,
        width: viewport.width,
        moved: d.moved,
      }),
    );
  };
  const endDrag = (event) => {
    const d = drag.current;
    if (!d) return;
    if (d.moved) {
      const willDock = isChatDockTarget({ x: event.clientX, width: viewport.width, moved: d.moved });
      // Docking removes the bubble before its synthetic click; don't swallow a later open.
      skipClick.current = d.kind === "bubble" && !willDock;
      if (willDock) {
        setMode("docked");
        setOpen(true);
      }
    }
    drag.current = null;
    setDockTarget(false);
  };
  const panelStyle = mobile
    ? { left: 0, top: viewport.top, width: "100%", height: viewport.height }
    : docked
      ? { right: 0, top: 64, width: 360, height: "calc(100dvh - 64px)" }
      : mode === "expanded"
        ? {
            left: "50%",
            top: "50%",
            transform: "translate(-50%,-50%)",
            width: "min(900px,calc(100vw - 40px))",
            height: "min(820px,calc(100dvh - 100px))",
          }
        : {
            right: chatFloatingRight(position.x, viewport.width),
            bottom: 24,
            width: Math.min(420, viewport.width - 32),
            height: "min(700px,calc(100dvh - 100px))",
          };
  const displayDraft = editing
    ? {
        content: editContent,
        files: editing.attachments.map((f) => ({
          ...f,
          localId: f.id,
          upload: f,
        })),
      }
    : draft;
  const edit = (m) => {
    if (busyRef.current || voiceSending.current || voice.status !== "inactive" || draft.pending) return;
    setEditing(m);
    setEditContent(m.content);
    editRequest.current = null;
    setError("");
  };
  const reply = (message) => {
    if (busyRef.current || voiceSending.current || draft.pending) return;
    setEditing(null);
    setEditContent("");
    editRequest.current = null;
    storeDraft(
      channelId,
      changeChatDraft(draftsRef.current[channelId] || newDraft(), {
        reply: message,
      }),
    );
  };
  if (blocked) return null;
  return createPortal(
    <>
      {!shown && (
        <button
          ref={bubble}
          type="button"
          aria-label={`Abrir chat${unread ? `, ${unread} mensajes sin leer` : ""}`}
          className="fixed z-[49] flex h-14 w-14 touch-none items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          style={{ left: position.x, top: position.y }}
          onPointerDown={(e) => beginDrag(e, "bubble")}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={() => {
            drag.current = null;
            setDockTarget(false);
          }}
          onClick={() => {
            if (skipClick.current) {
              skipClick.current = false;
              return;
            }
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.altKey && e.key.startsWith("Arrow")) {
              e.preventDefault();
              setPosition((p) =>
                clampChatPosition(
                  {
                    x:
                      p.x +
                      (e.key === "ArrowRight"
                        ? 24
                        : e.key === "ArrowLeft"
                          ? -24
                          : 0),
                    y:
                      p.y +
                      (e.key === "ArrowDown"
                        ? 24
                        : e.key === "ArrowUp"
                          ? -24
                          : 0),
                  },
                  viewport.width,
                  viewport.height,
                ),
              );
            }
          }}
        >
          <MessageCircle className="h-6 w-6" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 rounded-full border-2 border-background bg-primary px-1.5 text-[10px] text-primary-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      )}
      {dockTarget && (
        <div className="pointer-events-none fixed bottom-4 right-2 top-20 z-[80] flex w-80 items-center justify-center rounded-xl border border-border bg-muted/90 text-sm font-medium">
          Suelta para fijar el chat
        </div>
      )}
      {shown && (
        <section
          ref={pane}
          role={mobile ? "dialog" : "region"}
          aria-modal={mobile || undefined}
          aria-label="Chat del equipo"
          className={`team-chat fixed z-[65] flex min-w-0 flex-col overflow-hidden border border-border bg-background text-foreground ${mobile || docked ? "" : "rounded-2xl shadow-lg"}`}
          style={panelStyle}
        >
          <header
            className="flex shrink-0 touch-none items-center gap-1 border-b border-border px-2 py-2"
            onPointerDown={(e) => beginDrag(e, "panel")}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={() => {
              drag.current = null;
              setDockTarget(false);
            }}
          >
            <button
              className={button}
              type="button"
              onClick={() => setChannelsVisible((v) => !v)}
              aria-label={channelsVisible ? "Volver al chat" : "Ver canales"}
            >
              {channelsVisible ? (
                <ArrowLeft className="h-4 w-4" />
              ) : (
                <MessageCircle className="h-4 w-4" />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold">
                {channelsVisible
                  ? "Canales"
                  : `# ${selected?.name || "General"}`}
              </h2>
              <p className="text-[11px] text-muted-foreground" role="status">
                {selected?.isArchived ? "Canal archivado" : chat.connection}
              </p>
            </div>
            {!mobile && (
              <button
                type="button"
                className={button}
                aria-label={
                  mode === "expanded" ? "Reducir chat" : "Ampliar chat"
                }
                onClick={() =>
                  setMode(mode === "expanded" ? "floating" : "expanded")
                }
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={button}
                  type="button"
                  aria-label="Opciones del chat"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[90]">
                {!mobile && viewport.width >= CHAT_DOCK_MIN_WIDTH && (
                  <DropdownMenuItem
                    onSelect={() => setMode(docked ? "floating" : "docked")}
                  >
                    {docked ? "Desfijar" : "Fijar a la derecha"}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onSelect={() => {
                    setSearchOpen(true);
                    setFilesOnly(false);
                  }}
                >
                  Buscar mensajes
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setSearchOpen(true);
                    setFilesOnly(true);
                  }}
                >
                  Archivos y enlaces
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={async () => {
                    try {
                      await client.request(`/channels/${channelId}/muted`, {
                        method: "PUT",
                        body: { muted: !selected?.muted },
                      });
                      await chat.refresh();
                    } catch (e) {
                      setError(failure("mute", e));
                    }
                  }}
                >
                  {selected?.muted ? "Activar avisos" : "Silenciar avisos"}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSoundMuted(!soundMuted)}>
                  {soundMuted
                    ? "Activar sonido del chat"
                    : "Silenciar sonido del chat"}
                </DropdownMenuItem>
                {currentUser.role === "ADMIN" && (
                  <DropdownMenuItem
                    onSelect={() =>
                      openDialog({
                        type: "channel",
                        name: "",
                        private: false,
                        members: [],
                        requestId: uid(),
                      })
                    }
                  >
                    Crear canal
                  </DropdownMenuItem>
                )}
                {currentUser.role === "ADMIN" &&
                  selected?.id !== "general" &&
                  selected && (
                    <DropdownMenuItem
                      onSelect={() =>
                        openDialog({
                          type: "channel",
                          channel: selected,
                          name: selected.name,
                          private: selected.isPrivate,
                          archived: selected.isArchived,
                          members: [],
                          requestId: uid(),
                        })
                      }
                    >
                      Administrar canal
                    </DropdownMenuItem>
                  )}
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              className={button}
              type="button"
              onClick={close}
              aria-label="Cerrar chat"
            >
              <X className="h-5 w-5" />
            </button>
          </header>
          {channelsVisible ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {chat.channels.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`flex min-h-12 w-full items-center gap-2 rounded-lg px-3 py-3 text-left text-sm ${c.id === channelId ? "bg-muted" : "hover:bg-muted/60"}`}
                  onClick={() => switchChannel(c.id)}
                  disabled={busy}
                >
                  <span className="min-w-0 flex-1 truncate">
                    # {c.name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {c.isPrivate ? "Privado" : ""}
                      {c.isArchived ? " · Archivado" : ""}
                    </span>
                  </span>
                  {c.unread > 0 && (
                    <span className="rounded-full bg-primary/10 px-2 text-xs text-primary">
                      {c.unread}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <>
              {searchOpen && (
                <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    maxLength={200}
                    aria-label="Buscar en este canal"
                    placeholder={
                      filesOnly
                        ? "Buscar archivos o enlaces…"
                        : "Buscar en este canal…"
                    }
                    className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
                  <button
                    className={button}
                    type="button"
                    aria-label="Cerrar búsqueda"
                    onClick={() => {
                      setQuery("");
                      setFilesOnly(false);
                      setSearchOpen(false);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {!!selection.length && (
                <div className="flex items-center gap-2 border-b border-border px-3 text-xs">
                  <span className="flex-1">
                    {selection.length} seleccionados
                  </span>
                  <button
                    className={button}
                    type="button"
                    onClick={() => forward(selection)}
                  >
                    Reenviar
                  </button>
                  <button
                    className={button}
                    type="button"
                    onClick={() => setSelection([])}
                  >
                    Cancelar
                  </button>
                </div>
              )}
              <div
                ref={list}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3"
                onScroll={() => {
                  const el = list.current;
                  bottom.current =
                    el.scrollHeight - el.scrollTop - el.clientHeight < 60;
                  if (bottom.current) setNewMessages(false);
                  if (el.scrollTop < 40 && before && !loading)
                    void loadPage(true);
                }}
              >
                {before && (
                  <button
                    type="button"
                    className={button + " w-full text-xs text-muted-foreground"}
                    disabled={loading}
                    onClick={() => loadPage(true)}
                  >
                    Cargar mensajes anteriores
                  </button>
                )}
                {loading && (
                  <p
                    role="status"
                    className="py-3 text-center text-xs text-muted-foreground"
                  >
                    Cargando mensajes…
                  </p>
                )}
                {loadError && (
                  <div role="alert" className="p-3 text-sm text-destructive">
                    {loadError}
                    <button
                      type="button"
                      className={button}
                      onClick={() => loadPage(false)}
                    >
                      Reintentar
                    </button>
                  </div>
                )}
                {!loading && !loadError && !visibleMessages.length && (
                  <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-6 text-center">
                    <MessageCircle className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-medium">
                      {query || filesOnly
                        ? "Sin resultados"
                        : "Un espacio para conversar"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {query || filesOnly
                        ? "Prueba con otras palabras."
                        : "Comparte una idea, un archivo o una nota de voz con el equipo."}
                    </p>
                  </div>
                )}
                {visibleMessages.map((m, i) => (
                  <React.Fragment key={m.id}>
                    {(i === 0 ||
                      new Date(m.createdAt).toLocaleDateString("es-CO", {
                        timeZone: "America/Bogota",
                      }) !==
                        new Date(
                          visibleMessages[i - 1].createdAt,
                        ).toLocaleDateString("es-CO", {
                          timeZone: "America/Bogota",
                        })) && (
                      <p className="my-3 text-center text-[11px] text-muted-foreground">
                        {new Date(m.createdAt).toLocaleDateString("es-CO", {
                          timeZone: "America/Bogota",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    )}
                    <ChatMessage
                      message={m}
                      userId={currentUser.id}
                      userRole={currentUser.role}
                      client={client}
                      onEdit={edit}
                      onDelete={(message) =>
                        openDialog({
                          type: "delete",
                          message,
                          requestId: uid(),
                        })
                      }
                      onReply={reply}
                      onReact={react}
                      onForward={forward}
                      onSelect={(id) =>
                        setSelection((s) =>
                          s.includes(id)
                            ? s.filter((x) => x !== id)
                            : s.length < 20
                              ? [...s, id]
                              : s,
                        )
                      }
                      selected={selection.includes(m.id)}
                      selectionMode={selection.length > 0}
                      onJump={jump}
                      onVisible={visible}
                    />
                  </React.Fragment>
                ))}
              </div>
              {newMessages && (
                <button
                  type="button"
                  className="shrink-0 bg-muted p-2 text-xs text-primary"
                  onClick={() => {
                    bottom.current = true;
                    list.current.scrollTop = list.current.scrollHeight;
                    setNewMessages(false);
                  }}
                >
                  Ir a los mensajes recientes ↓
                </button>
              )}
              {draft.pending && !busy && (
                <div
                  role="status"
                  className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2 text-xs"
                >
                  <span className="flex-1">
                    Envío pendiente de confirmar. Conservamos tu mensaje.
                  </span>
                  <button
                    type="button"
                    className={button + " text-primary"}
                    onClick={send}
                  >
                    Reintentar
                  </button>
                </div>
              )}
              <ChatComposer
                draft={displayDraft}
                files={fileMap}
                onChange={change}
                onFiles={(files) => addFiles(files)}
                onRemove={(f) => {
                  if (editing || draft.pending) return;
                  change({
                    files: draft.files.filter((x) => x.localId !== f.localId),
                  });
                  fileRef.current.delete(f.localId);
                  setFileMap(new Map(fileRef.current));
                  void removeChatFile(currentUser.id, f.localId).catch((e) =>
                    console.error("[TeamChat remove file]", e.message),
                  );
                }}
                onSend={send}
                busy={busy || voiceFinishing}
                progress={progress}
                error={error}
                onCancel={() => uploadAbort.current?.abort()}
                roster={chat.roster}
                voice={voice}
                onRecord={record}
                onPause={() => recorder.current?.pause()}
                onResume={() => recorder.current?.resume()}
                onSendVoice={sendVoice}
                voiceFinishing={voiceFinishing}
                onDiscard={() => recorder.current?.cancel()}
                editing={editing}
                onCancelEdit={() => {
                  if (!busy) {
                    setEditing(null);
                    setError("");
                  }
                }}
                disabled={
                  !selected ||
                  selected.isArchived ||
                  recordPending ||
                  Boolean(draft.pending)
                }
              />
            </>
          )}
        </section>
      )}
      <Dialog
        open={Boolean(dialog)}
        onOpenChange={(value) => {
          if (!value && !dialogBusy) setDialog(null);
        }}
      >
        <DialogContent
          className="z-[90]"
          overlayClassName="z-[85]"
          showCloseButton={!dialogBusy}
        >
          <DialogTitle>
            {dialog?.type === "delete"
              ? "Eliminar mensaje"
              : dialog?.type === "forward"
                ? "Reenviar mensajes"
                : dialog?.type === "message"
                  ? "Mensaje original"
                  : dialog?.channel
                    ? "Administrar canal"
                    : "Crear canal"}
          </DialogTitle>
          <DialogDescription>
            {dialog?.type === "delete"
              ? "El contenido dejará de estar disponible en este canal."
              : dialog?.type === "forward"
                ? "Selecciona el canal de destino."
                : dialog?.type === "message"
                  ? "Consulta la versión actual de la conversación."
                  : "Organiza las conversaciones del equipo."}
          </DialogDescription>
          {dialog?.type === "forward" && (
            <Select
              value={dialog.target}
              onChange={(e) =>
                setDialog((d) => ({
                  ...d,
                  target: e.target.value,
                  requestId: uid(),
                }))
              }
              aria-label="Canal de destino"
            >
              <option value="">Selecciona un canal</option>
              {chat.channels
                .filter((c) => !c.isArchived)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    # {c.name}
                  </option>
                ))}
            </Select>
          )}
          {dialog?.type === "channel" && (
            <>
              <label className="text-sm">
                Nombre del canal
                <input
                  className="mt-1 h-11 w-full rounded-lg border border-border bg-background px-3"
                  maxLength={60}
                  value={dialog.name}
                  onChange={(e) =>
                    setDialog((d) => ({
                      ...d,
                      name: e.target.value,
                      requestId: uid(),
                    }))
                  }
                />
              </label>
              {!dialog.channel && (
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={dialog.private}
                    onChange={(e) =>
                      setDialog((d) => ({
                        ...d,
                        private: e.target.checked,
                        requestId: uid(),
                      }))
                    }
                  />
                  Canal privado
                </label>
              )}
              {dialog.private && (
                <fieldset className="max-h-52 overflow-y-auto rounded-lg border border-border p-3">
                  <legend className="text-sm">Personas con acceso</legend>
                  {chat.roster
                    .filter((m) => m.id !== currentUser.id)
                    .map((m) => (
                      <label
                        key={m.id}
                        className="flex min-h-11 items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={dialog.members.includes(m.id)}
                          onChange={(e) =>
                            setDialog((d) => ({
                              ...d,
                              members: e.target.checked
                                ? [...d.members, m.id]
                                : d.members.filter((id) => id !== m.id),
                              requestId: uid(),
                            }))
                          }
                        />
                        {m.name}
                      </label>
                    ))}
                </fieldset>
              )}
              {dialog.channel && (
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={dialog.archived}
                    onChange={(e) =>
                      setDialog((d) => ({
                        ...d,
                        archived: e.target.checked,
                        requestId: uid(),
                      }))
                    }
                  />
                  Archivar canal (conservar historial)
                </label>
              )}
            </>
          )}
          {dialog?.type === "message" && (
            <ChatMessage
              message={dialog.message}
              userId={currentUser.id}
              userRole={currentUser.role}
              client={client}
              onEdit={(m) => {
                setDialog(null);
                edit(m);
              }}
              onDelete={(message) =>
                openDialog({ type: "delete", message, requestId: uid() })
              }
              onReply={(m) => {
                setDialog(null);
                reply(m);
              }}
              onReact={react}
              onForward={forward}
              onSelect={() => {}}
              onJump={jump}
            />
          )}
          {dialogError && (
            <p role="alert" className="text-sm text-destructive">
              {dialogError}
            </p>
          )}
          {dialog?.type !== "message" && (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={button}
                disabled={dialogBusy}
                onClick={() => setDialog(null)}
              >
                Cancelar
              </button>
              <Button
                type="button"
                variant={dialog?.type === "delete" ? "destructive" : "default"}
                className="min-h-11"
                disabled={
                  dialogBusy ||
                  dialog?.loadingMembers ||
                  (dialog?.type === "forward" && !dialog.target) ||
                  (dialog?.type === "channel" && !dialog.name.trim())
                }
                onClick={saveDialog}
              >
                {dialogBusy
                  ? "Guardando…"
                  : dialog?.type === "delete"
                    ? "Eliminar"
                    : dialog?.type === "forward"
                      ? "Reenviar"
                      : "Guardar"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>,
    document.body,
  );
}
