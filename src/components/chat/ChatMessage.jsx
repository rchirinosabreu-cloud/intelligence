import React, { useEffect, useRef, useState } from "react";
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
} from "@/components/ui/icons";
import ChatFilePreview from "./ChatFilePreview";
const reactions = ["👍", "❤️", "😂", "🎉", "👀", "🙌", "✅", "🙏", "🔥", "💡"];

function Attachment({ file, messageId, client }) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [speed, setSpeed] = useState(1);
  const media = useRef(null),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const open = async (download = false) => {
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
      console.error("[TeamChat attachment]", e.message);
      setError(e.message);
    } finally {
      if (alive.current) setLoading(false);
    }
  };
  const isMedia = /^(image|video|audio)\//.test(file.mimeType);
  return (
    <div className="my-2 max-w-full rounded-lg border border-border bg-background p-2">
      <div className="flex min-w-0 items-center gap-2">
        <Paperclip className="h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1 text-left text-xs">
          <span className="block truncate font-medium">{file.name}</span>
          <span className="text-muted-foreground">
            {loading
              ? "Abriendo…"
              : `${(file.size / 1024 / 1024).toFixed(1)} MB`}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs hover:bg-muted disabled:opacity-50"
          aria-label={`Ver ${file.name}`}
          onClick={() => open()}
          disabled={loading}
        >
          <Eye className="h-4 w-4" /> Ver
        </button>
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
      {url && file.mimeType.startsWith("image/") && (
        <a href={url} target="_blank" rel="noreferrer">
          <img
            alt={file.name}
            src={url}
            className="max-h-64 max-w-full rounded object-contain"
            onError={() =>
              setError(
                "No se pudo mostrar la imagen. Puedes descargar el original.",
              )
            }
          />
        </a>
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
      {url && file.mimeType.startsWith("audio/") && (
        <>
          <audio
            ref={media}
            src={url}
            controls
            preload="metadata"
            className="h-11 w-full min-w-0"
            onError={() =>
              setError(
                "No se pudo reproducir. Abre de nuevo el audio o descarga el original.",
              )
            }
          />
          <button
            type="button"
            className="min-h-11 px-2 text-xs"
            aria-label={`Velocidad de reproducción ${speed}x`}
            onClick={() => {
              const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
              setSpeed(next);
              if (media.current) media.current.playbackRate = next;
            }}
          >
            {speed}×
          </button>
        </>
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
  const swipe = useRef(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const resetSwipe = () => {
    swipe.current = null;
    setSwipeOffset(0);
  };
  const canReplyFrom = (event) =>
    !message.deletedAt &&
    !selectionMode &&
    event.currentTarget.contains(event.target) &&
    !event.target.closest(
      'a,button,input,textarea,select,audio,video,[role="button"],[role="dialog"],[contenteditable="true"]',
    );
  const [picker, setPicker] = useState(false);
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
      onDoubleClick={(event) => {
        if (canReplyFrom(event)) onReply?.(message);
      }}
      onPointerDown={(event) => {
        if (
          event.pointerType !== "touch" ||
          !event.isPrimary ||
          !canReplyFrom(event)
        )
          return;
        swipe.current = {
          x: event.clientX,
          y: event.clientY,
          id: event.pointerId,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        const start = swipe.current;
        if (!start || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x,
          dy = Math.abs(event.clientY - start.y);
        if (dy > 24 || dx < -12) {
          resetSwipe();
          return;
        }
        setSwipeOffset(dx > 12 && dx > dy * 2 ? Math.min(dx, 72) : 0);
      }}
      onPointerUp={(event) => {
        const start = swipe.current;
        resetSwipe();
        if (
          !start ||
          start.id !== event.pointerId ||
          message.deletedAt ||
          selectionMode
        )
          return;
        const dx = event.clientX - start.x,
          dy = Math.abs(event.clientY - start.y);
        if (dx >= 64 && dy <= 24 && dx > dy * 2) onReply?.(message);
      }}
      onPointerCancel={resetSwipe}
      onLostPointerCapture={resetSwipe}
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
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {message.reactions.map((r) => (
                <button
                  type="button"
                  key={r.emoji}
                  onClick={() =>
                    onReact(message, r.emoji, !r.userIds.includes(userId))
                  }
                  aria-label={`${r.emoji}, ${r.userIds.length} reacciones`}
                  aria-pressed={r.userIds.includes(userId)}
                  className={`min-h-9 rounded-full border px-2 text-xs ${r.userIds.includes(userId) ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-background"}`}
                >
                  {r.emoji} {r.userIds.length}
                </button>
              ))}
              <Popover.Root open={picker} onOpenChange={setPicker}>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                    aria-label="Añadir reacción"
                  >
                    ☺
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
              <>
                <DropdownMenuItem onSelect={() => onEdit(message)}>
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => onDelete(message)}
                  className="brain-destructive-text text-destructive focus:text-destructive"
                >
                  Eliminar
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </article>
  );
}
