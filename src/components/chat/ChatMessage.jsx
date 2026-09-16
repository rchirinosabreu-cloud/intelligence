import React, { useCallback, useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import DOMPurify from "isomorphic-dompurify";
import TeamAvatar from "@/components/ui/TeamAvatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Paperclip,
  Download,
  Eye,
  SmilePlus,
} from "@/components/ui/icons";
import ChatFilePreview from "./ChatFilePreview";
import useMessageGestures from "./useMessageGestures";
import { formatChatFileSize } from "@/lib/teamChatState";
const reactions = ["👍", "❤️", "😂", "🎉", "👀", "🙌", "✅", "🙏", "🔥", "💡"];

function Attachment({ file, messageId, client }) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [speed, setSpeed] = useState(1);
  const media = useRef(null),
    container = useRef(null),
    alive = useRef(true);
  const isImage = file.mimeType.startsWith("image/");
  const isAudio = file.mimeType.startsWith("audio/");
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const open = useCallback(async (download = false) => {
    setLoading(true);
    setError("");
    try {
      const result = await client.media(messageId, file.id);
      if (!alive.current) return;
      if (download) {
        const a = document.createElement("a");
        a.href = result.url + "&download=1";
        a.download = file.name;
        a.click();
      } else setUrl(result.url);
    } catch (e) {
      console.error("[TeamChat attachment]", e.response?.data || e.message);
      setError(e.message);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [client, messageId, file.id, file.name]);
  useEffect(() => {
    if (!isImage && !isAudio) return;
    // Only resolve protected media tickets as the attachment approaches view.
    // Reactions and other realtime updates must not request the image again.
    if (typeof IntersectionObserver === "undefined") {
      void open();
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        void open();
      }
    }, { rootMargin: "200px" });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, [isImage, isAudio, open]);
  const isMedia = /^(image|video|audio)\//.test(file.mimeType);
  if (isAudio) return (
    <div ref={container} className="my-2 w-72 max-w-full">
      {!file.name.startsWith("nota-de-voz-") && (
        <p className="mb-1 truncate text-xs text-muted-foreground" title={file.name}>{file.name}</p>
      )}
      <audio ref={media} src={url || undefined} controls preload="metadata"
        aria-label={`Reproducir ${file.name}`} className="h-11 w-full min-w-0"
        onLoadedMetadata={() => { if (media.current) media.current.playbackRate = speed; }}
        onError={() => setError("No se pudo reproducir el audio. Inténtalo de nuevo.")} />
      <div className="flex items-center gap-1">
        <button type="button" className="min-h-11 min-w-11 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted"
          aria-label={`Velocidad de reproducción ${speed}x`}
          onClick={() => { const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1; setSpeed(next); if (media.current) media.current.playbackRate = next; }}>
          {speed}×
        </button>
        <span className="min-w-0 flex-1 text-[11px] text-muted-foreground" role={loading ? "status" : undefined}>
          {loading ? "Cargando audio…" : formatChatFileSize(file.size)}
        </span>
        <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-50"
          aria-label={`Descargar ${file.name}`} title="Descargar audio" disabled={loading} onClick={() => open(true)}>
          <Download className="h-4 w-4" />
        </button>
      </div>
      {error && <div role="alert" className="text-xs text-destructive">
        {error}
        <button type="button" className="min-h-11 rounded-lg px-2 text-foreground hover:bg-muted" disabled={loading}
          aria-label={`Reintentar audio ${file.name}`} onClick={() => open()}>Reintentar</button>
      </div>}
    </div>
  );
  return (
    <div ref={container} className={`my-2 min-w-0 rounded-lg border border-border bg-background p-2 ${isImage ? "w-fit max-w-[min(100%,20rem)]" : "max-w-full"}`}>
      {isImage && url && !error && (
        <a href={url} target="_blank" rel="noreferrer" aria-label={`Ampliar ${file.name}`}>
          <img
            alt={file.name}
            src={url}
            loading="lazy"
            className="mb-2 max-h-64 max-w-full rounded object-contain"
            onError={() => setError("No se pudo mostrar la imagen. Inténtalo de nuevo o descarga el original.")}
          />
        </a>
      )}
      {isImage && !url && !error && (
        <div className="mb-2 flex h-32 items-center justify-center rounded bg-muted text-xs text-muted-foreground" role="status">
          Cargando imagen…
        </div>
      )}
      <div className="flex min-w-0 items-center gap-2">
        <Paperclip className="h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1 text-left text-xs">
          <span className="block truncate font-medium">{file.name}</span>
          <span className="text-muted-foreground">
            {loading
              ? "Abriendo…"
              : formatChatFileSize(file.size)}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {(!isImage || error) && <button
          type="button"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs hover:bg-muted disabled:opacity-50"
          aria-label={`${isImage ? "Reintentar imagen" : "Ver"} ${file.name}`}
          onClick={() => open()}
          disabled={loading}
        >
          <Eye className="h-4 w-4" /> {isImage ? "Reintentar" : "Ver"}
        </button>}
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs hover:bg-muted disabled:opacity-50"
          aria-label={`Descargar ${file.name}`}
          onClick={() => open(true)}
          disabled={loading}
        >
          <Download className="h-4 w-4" /> Descargar
        </button>
      </div>
      {url && !isMedia && (
        <ChatFilePreview
          file={file}
          url={url}
          onClose={() => setUrl("")}
          onDownload={() => open(true)}
          downloading={loading}
        />
      )}
      {url && file.mimeType.startsWith("video/") && (
        <video
          src={url}
          controls
          preload="metadata"
          className="max-h-64 w-full rounded"
          onError={() =>
            setError(
              "El navegador no reproduce este vídeo. Puedes descargar el original.",
            )
          }
        />
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
export default function ChatMessage({
  message,
  userId,
  userRole,
  onEdit,
  onDelete,
  onReply,
  onReact,
  onForward,
  onSelect,
  selected,
  selectionMode,
  client,
  onJump,
  onVisible,
}) {
  const item = useRef(null);
  const [picker, setPicker] = useState(false);
  const { offset: swipeOffset, props: gestures } = useMessageGestures(item, {
    message, selectionMode, onReply, onReact: () => setPicker(true),
  });
  useEffect(() => {
    const node = item.current;
    if (!node || !onVisible) return;
    let intersecting = false;
    const reportVisible = () => {
      if (
        intersecting &&
        document.visibilityState === "visible" &&
        document.hasFocus()
      )
        onVisible(message);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        intersecting = Boolean(entries[0]?.isIntersecting);
        reportVisible();
      },
      { threshold: 0.75 },
    );
    observer.observe(node);
    window.addEventListener("focus", reportVisible);
    document.addEventListener("visibilitychange", reportVisible);
    return () => {
      observer.disconnect();
      window.removeEventListener("focus", reportVisible);
      document.removeEventListener("visibilitychange", reportVisible);
    };
  }, [message, onVisible]);
  return (
    <article
      ref={item}
      {...gestures}
      style={{
        transform: swipeOffset ? `translateX(${swipeOffset}px)` : undefined,
      }}
      data-message-id={message.id}
      className={`group relative flex touch-pan-y gap-2.5 rounded-lg px-2 py-3 ${selected ? "bg-primary/10" : "hover:bg-muted/40"}`}
    >
      {swipeOffset > 20 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-12 top-4 text-xs text-muted-foreground"
        >
          Responder
        </span>
      )}
      {selectionMode && (
        <input
          type="checkbox"
          aria-label={`Seleccionar mensaje de ${message.author.name}`}
          checked={selected}
          onChange={() => onSelect(message.id)}
          className="mt-2 h-5 w-5 shrink-0"
        />
      )}
      <TeamAvatar member={message.author} size={32} className="mt-1 h-8 w-8" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-xs font-semibold">
            {message.author.name}
          </span>
          <time
            className="shrink-0 text-[11px] text-muted-foreground"
            dateTime={message.createdAt}
          >
            {new Date(message.createdAt).toLocaleTimeString("es-CO", {
              timeZone: "America/Bogota",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
          {message.editedAt && !message.deletedAt && (
            <span className="text-[10px] text-muted-foreground">editado</span>
          )}
        </div>
        {message.deletedAt ? (
          <p className="mt-1 text-xs italic text-muted-foreground">
            Mensaje eliminado
          </p>
        ) : (
          <>
            {message.forwarded && (
              <span className="text-[11px] italic text-muted-foreground">
                Reenviado
              </span>
            )}
            {message.reply && (
              <button
                type="button"
                onClick={() => onJump(message.reply.id)}
                className="my-1 block max-w-full truncate border-l-2 border-primary pl-2 text-left text-xs text-muted-foreground"
              >
                {message.reply.text}
              </button>
            )}
            <div className="flex min-w-0 items-start gap-1">
              <div className="min-w-0 max-w-full">
                <div
                  className="chat-rich-text mt-1 break-words text-sm"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(message.content),
                  }}
                />
                {message.attachments.map((file) => (
                  <Attachment
                    key={file.id}
                    file={file}
                    messageId={message.id}
                    client={client}
                  />
                ))}
              </div>
              <Popover.Root open={picker} onOpenChange={setPicker}>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    className="-mt-2 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-60 hover:bg-muted hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Añadir reacción"
                  >
                    <SmilePlus className="h-4 w-4" />
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    className="brain-popover-surface z-[90] flex max-w-[calc(100vw-24px)] flex-wrap gap-1 p-2"
                    sideOffset={5}
                    collisionPadding={12}
                  >
                    {reactions.map((emoji) => (
                      <button
                        type="button"
                        key={emoji}
                        className="min-h-11 min-w-11 rounded-lg text-lg hover:bg-muted"
                        aria-label={`Reaccionar ${emoji}`}
                        onClick={() => {
                          onReact(
                            message,
                            emoji,
                            !message.reactions.some(
                              (r) =>
                                r.emoji === emoji && r.userIds.includes(userId),
                            ),
                          );
                          setPicker(false);
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>
            {message.reactions.length > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {message.reactions.map((r) => (
                  <button
                    type="button"
                    key={r.emoji}
                    onClick={() => onReact(message, r.emoji, !r.userIds.includes(userId))}
                    aria-label={`${r.emoji}, ${r.userIds.length} reacciones`}
                    aria-pressed={r.userIds.includes(userId)}
                    className={`min-h-9 rounded-full border px-2 text-xs ${r.userIds.includes(userId) ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-background"}`}
                  >
                    {r.emoji} {r.userIds.length}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {!message.deletedAt && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              aria-label={`Acciones del mensaje de ${message.author.name}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[90]">
            <DropdownMenuItem onSelect={() => onReply(message)}>
              Responder
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onForward([message.id])}>
              Reenviar
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSelect(message.id)}>
              Seleccionar
            </DropdownMenuItem>
            {message.author.id === userId && (
                <DropdownMenuItem onSelect={() => onEdit(message)}>
                  Editar
                </DropdownMenuItem>
            )}
            {(message.author.id === userId || userRole === "ADMIN") && (
                <DropdownMenuItem
                  onSelect={() => onDelete(message)}
                  className="brain-destructive-text text-destructive focus:text-destructive"
                >
                  Eliminar
                </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </article>
  );
}
