import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import RichTextEditor from "@/components/ui/RichTextEditor";
import { Paperclip, Mic, Send, X, Pause, PlayCircle, Trash2 } from "@/components/ui/icons";
import { formatChatFileSize } from "@/lib/teamChatState";
const iconButton =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-40";
const destructiveIconButton = iconButton.replace(
  "text-muted-foreground hover:bg-muted",
  "brain-destructive-text text-destructive hover:bg-destructive/10",
);
function DraftFile({ entry, file, onRemove }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!file) return;
    const object = URL.createObjectURL(file);
    setUrl(object);
    return () => URL.revokeObjectURL(object);
  }, [file]);
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background p-2">
      <div className="flex items-center gap-2">
        <Paperclip className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-xs" title={entry.name}>
          {entry.name}
        </span>
        <button
          type="button"
          className={destructiveIconButton}
          onClick={onRemove}
          aria-label={`Quitar ${entry.name}`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {url && file?.type.startsWith("audio/") && (
        <audio
          controls
          preload="metadata"
          src={url}
          className="h-10 w-full min-w-0"
        />
      )}
      {url && file?.type.startsWith("image/") && (
        <img
          src={url}
          alt={`Vista previa de ${entry.name}`}
          className="max-h-24 max-w-full rounded object-contain"
        />
      )}
      <span className="text-[11px] text-muted-foreground">
        {formatChatFileSize(entry.size)}
        {entry.upload ? " · Listo para enviar" : ""}
        {entry.missing ? " · Selecciona el archivo de nuevo" : ""}
      </span>
    </div>
  );
}
export default function ChatComposer({
  draft,
  onChange,
  onFiles,
  onRemove,
  onSend,
  busy,
  progress,
  error,
  onCancel,
  roster,
  voice,
  onRecord,
  onPause,
  onResume,
  onSendVoice,
  voiceFinishing,
  onDiscard,
  files,
  editing,
  onCancelEdit,
  disabled,
}) {
  const input = useRef(null),
    editor = useRef(null),
    editorShell = useRef(null),
    wasBusy = useRef(false),
    restoreSendFocus = useRef(false);
  const canSend =
    !busy &&
    !disabled &&
    voice.status === "inactive" &&
    Boolean(
      draft.content?.replace(/<[^>]*>/g, "").trim() || draft.files?.length,
    );
  const replyId = draft.reply?.id;
  useEffect(() => {
    if (replyId) editor.current?.focus();
  }, [replyId]);
  useLayoutEffect(() => {
    const shell = editorShell.current;
    if (!shell) return;
    if (busy && !wasBusy.current)
      restoreSendFocus.current = shell.contains(document.activeElement);
    const locked = Boolean(busy || disabled || voice.status !== "inactive");
    shell.inert = locked;
    if (!busy && wasBusy.current) {
      // Inert blurs the editor during the request. Restore it only if the user
      // has not moved to another control while waiting for the server.
      if (restoreSendFocus.current && !locked &&
          (document.activeElement === document.body || shell.contains(document.activeElement)))
        editor.current?.focus();
      restoreSendFocus.current = false;
    }
    wasBusy.current = busy;
  }, [busy, disabled, voice.status]);
  const paste = (e) => {
    const added = [...(e.clipboardData?.files || [])];
    if (added.length) {
      e.preventDefault();
      onFiles(added);
    }
  };
  return (
    <div className="shrink-0 border-t border-border bg-background p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
      {editing && (
        <div className="mb-2 flex items-center justify-between gap-2 text-xs">
          <span>Editando mensaje</span>
          <button
            type="button"
            onClick={onCancelEdit}
            className="min-h-11 px-2"
          >
            Cancelar edición
          </button>
        </div>
      )}
      {draft.reply && (
        <div className="mb-2 flex items-center gap-2 border-l-2 border-primary pl-2 text-xs">
          <div className="min-w-0 flex-1">
            <span className="block truncate">
              Respondiendo a {draft.reply.author?.name}
            </span>
            <span className="block truncate text-muted-foreground">
              {draft.reply.text ||
                draft.reply.attachments?.map((file) => file.name).join(", ")}
            </span>
          </div>
          <button
            type="button"
            className={iconButton}
            onClick={() => onChange({ reply: null })}
            aria-label="Cancelar respuesta"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {!!draft.files?.length && (
        <div className="mb-2 max-h-40 space-y-2 overflow-y-auto">
          {draft.files.map((f) => (
            <DraftFile
              key={f.localId}
              entry={f}
              file={files.get(f.localId)}
              onRemove={() => !busy && onRemove(f)}
            />
          ))}
        </div>
      )}
      {voice.status !== "inactive" && (
        <div
          className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-muted p-2 text-sm"
          role="status"
        >
          <Mic className="h-4 w-4 text-destructive" />
          <span>
            {voice.status === "paused" ? "En pausa" : "Grabando"} ·{" "}
            {Math.floor(voice.seconds / 60)}:
            {String(voice.seconds % 60).padStart(2, "0")}
          </span>
          <button
            type="button"
            className={iconButton}
            onClick={voice.status === "paused" ? onResume : onPause}
            aria-label={voice.status === "paused" ? "Continuar grabación" : "Pausar grabación"}
            title={voice.status === "paused" ? "Continuar grabación" : "Pausar grabación"}
            disabled={voiceFinishing}
          >
            {voice.status === "paused" ? <PlayCircle className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
            onClick={onSendVoice}
            aria-label="Enviar nota de voz"
            title="Enviar nota de voz"
            disabled={voiceFinishing}
          >
            <Send className="h-5 w-5" />
          </button>
          <button
            type="button"
            className={destructiveIconButton}
            onClick={onDiscard}
            aria-label="Descartar grabación"
            title="Descartar grabación"
            disabled={voiceFinishing}
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      )}
      <div
        ref={editorShell}
        onPasteCapture={paste}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          if (e.dataTransfer.files.length) {
            e.preventDefault();
            onFiles([...e.dataTransfer.files]);
          }
        }}
      >
        <RichTextEditor
          ref={editor}
          value={draft.content || ""}
          onChange={(content) => onChange({ content })}
          onSend={canSend ? onSend : undefined}
          submitOnEnter
          compactFormats
          toolbarAlwaysVisible
          teamMembers={roster.map((m) => ({ ...m, id: m.memberId }))}
          placeholder={editing ? "Ajusta tu mensaje…" : "Escribe un mensaje…"}
          className="chat-rich-text px-3 py-2 text-sm text-foreground"
          attachmentAction={
            <>
              <button
                type="button"
                className={iconButton}
                onClick={() => input.current?.click()}
                aria-label="Adjuntar archivos"
                disabled={Boolean(editing)}
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={iconButton}
                onClick={onRecord}
                aria-label="Grabar nota de voz"
                disabled={Boolean(editing)}
              >
                <Mic className="h-4 w-4" />
              </button>
            </>
          }
          sendAction={
            <button
              type="button"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
              onClick={onSend}
              disabled={!canSend}
              aria-label={editing ? "Guardar edición" : "Enviar mensaje"}
            >
              <Send className="h-4 w-4" />
            </button>
          }
        />
        <input
          ref={input}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            onFiles([...e.target.files]);
            e.target.value = "";
          }}
          aria-label="Elegir archivos para el chat"
        />
      </div>
      {busy && (
        <div
          className="mt-2 flex items-center justify-between gap-2 text-xs"
          role="status"
        >
          <span>
            {progress === null
              ? "Guardando mensaje…"
              : `Subiendo archivos · ${progress}%`}
          </span>
          {progress !== null && (
            <button
              type="button"
              className="min-h-11 px-2 text-destructive"
              onClick={onCancel}
            >
              Cancelar
            </button>
          )}
        </div>
      )}
      {error && (
        <div className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </div>
      )}
      {!busy && !error && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {editing
            ? "Los cambios se guardan al confirmar."
            : "Enter para enviar · Shift + Enter para salto de línea"}
        </p>
      )}
    </div>
  );
}
