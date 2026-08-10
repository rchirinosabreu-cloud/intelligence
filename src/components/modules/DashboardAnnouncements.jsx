import React, { useRef, useState } from 'react';
import { Edit2, History, Loader2, Megaphone, Plus, Send, Trash2, X } from '@/components/ui/icons';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/button';
import DateDivider from '@/components/ui/DateDivider';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import RichCommentContent from '@/components/ui/RichCommentContent';
import RichTextEditor from '@/components/ui/RichTextEditor';
import SlideOver from '@/components/ui/SlideOver';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { APPROVED_EMOJIS } from '@/constants/approvedEmojis';
import { cn } from '@/lib/utils';

const formatAnnouncementDate = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

const groupAnnouncementsByDate = (announcements) => announcements.reduce((groups, announcement) => {
  const dateKey = new Date(announcement.createdAt).toISOString().split('T')[0];
  const latestGroup = groups[groups.length - 1];

  if (!latestGroup || latestGroup.dateKey !== dateKey) {
    groups.push({ dateKey, date: announcement.createdAt, announcements: [announcement] });
  } else {
    latestGroup.announcements.push(announcement);
  }

  return groups;
}, []);

const AnnouncementCard = ({ announcement, compact = false, showDate = true, canManage = false, onEdit, onDelete, isSubmitting = false }) => {
  const isPersonal = announcement.scope === 'MEMBER';

  return (
    <article
      className={cn(
        'rounded-lg p-4',
        isPersonal
          ? 'border border-violet-200/80 bg-violet-50/80 dark:border-violet-500/20 dark:bg-violet-500/10 shadow-sm'
          : 'border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-950/45',
        compact && 'p-3.5'
      )}
    >
      <div className="flex items-center justify-between gap-3 mb-2.5">
        {isPersonal ? (
          <div className="flex items-center gap-2 min-w-0">
            <TeamAvatar
              member={announcement.author || { name: 'Equipo Brainstudio' }}
              size={28}
              className="w-7 h-7 ring-2 ring-white dark:ring-zinc-900"
            />
            <span className="text-xs font-semibold text-violet-950 dark:text-violet-100 truncate">
              {announcement.author?.name || 'Equipo Brainstudio'}
            </span>
          </div>
        ) : (
          <span className="text-[10px] uppercase font-bold text-primary">
            Anuncio general
          </span>
        )}
        <div className="flex items-center gap-1.5">
          {showDate && (
            <time className="text-[11px] text-zinc-400 dark:text-zinc-500">
              {formatAnnouncementDate(announcement.createdAt)}
            </time>
          )}
          {!compact && canManage && (
            <>
              <button
                type="button"
                onClick={() => onEdit?.(announcement)}
                disabled={isSubmitting}
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                  isPersonal ? 'text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-500/15 hover:text-violet-700 dark:hover:text-violet-300' : 'text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-primary'
                )}
                title="Editar anuncio"
                aria-label="Editar anuncio"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onDelete?.(announcement)}
                disabled={isSubmitting}
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                  isPersonal ? 'text-violet-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-destructive' : 'text-zinc-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-destructive'
                )}
                title="Eliminar anuncio"
                aria-label="Eliminar anuncio"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
      <div className={cn(
        '[&>div]:!text-sm [&>div]:!leading-6',
        isPersonal && '[&_*]:!text-zinc-800 dark:[&_*]:!text-zinc-100 [&_mark]:!bg-violet-200/70 dark:[&_mark]:!bg-violet-500/25',
        compact && 'max-h-[96px] overflow-hidden'
      )}>
        <RichCommentContent content={announcement.content} />
      </div>
    </article>
  );
};

const DashboardAnnouncements = ({
  announcements = [],
  teamMembers = [],
  canManage = false,
  onCreate,
  onUpdate,
  onDelete,
  isSubmitting = false,
  error,
  className
}) => {
  const editorRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [scope, setScope] = useState('GLOBAL');
  const [targetUserId, setTargetUserId] = useState('');
  const [content, setContent] = useState('');
  const [plainText, setPlainText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [deleteCandidate, setDeleteCandidate] = useState(null);

  const activeMembers = teamMembers.filter((member) => member.userId && member.isActive !== false);
  const canPublish = plainText.trim() && (editingAnnouncement || scope === 'GLOBAL' || targetUserId);
  const announcementGroups = groupAnnouncementsByDate(announcements);

  const resetComposer = () => {
    setContent('');
    setPlainText('');
    setTargetUserId('');
    setShowEmojiPicker(false);
    setEditingAnnouncement(null);
    editorRef.current?.clear();
  };

  const startCreating = () => {
    resetComposer();
    setScope('GLOBAL');
    setIsComposerOpen(true);
  };

  const startEditing = (announcement) => {
    if (!canManage) return;
    setEditingAnnouncement(announcement);
    setScope(announcement.scope);
    setContent(announcement.content);
    setPlainText(announcement.content.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').trim());
    setShowEmojiPicker(false);
    setIsComposerOpen(true);
  };

  const openHistory = (compose = false) => {
    setIsOpen(true);
    if (compose && canManage) startCreating();
  };

  const handleSubmit = async () => {
    if (!canManage || !canPublish || isSubmitting) return;

    try {
      if (editingAnnouncement) {
        if (!canManage || !onUpdate) return;
        await onUpdate({
          id: editingAnnouncement.id,
          scope: editingAnnouncement.scope,
          content
        });
      } else {
        if (!onCreate) return;
        await onCreate({
          scope,
          targetUserId: scope === 'MEMBER' ? targetUserId : undefined,
          content
        });
      }
      resetComposer();
      setIsComposerOpen(false);
    } catch (submissionError) {
      console.error('[DashboardAnnouncements] Error saving announcement:', submissionError);
    }
  };

  const requestDelete = (announcement) => {
    if (!canManage || isSubmitting) return;
    setDeleteCandidate(announcement);
  };

  const confirmDelete = async () => {
    if (!canManage || !onDelete || !deleteCandidate || isSubmitting) return;

    try {
      await onDelete({ id: deleteCandidate.id, scope: deleteCandidate.scope });
      if (editingAnnouncement?.id === deleteCandidate.id) {
        resetComposer();
        setIsComposerOpen(false);
      }
      setDeleteCandidate(null);
    } catch (deletionError) {
      console.error('[DashboardAnnouncements] Error deleting announcement:', deletionError);
    }
  };

  return (
    <>
      <Card className={cn(className, 'p-0 flex flex-col min-h-[360px]')}>
        <div className="flex items-center justify-between gap-4 px-5 py-5 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-primary/10 dark:bg-primary/15 flex items-center justify-center shrink-0">
              <Megaphone className="w-[18px] h-[18px] text-primary" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-zinc-950 dark:text-white">Anuncios</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">Información importante para ti</p>
            </div>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => openHistory(true)}
              className="w-9 h-9 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-300 hover:text-primary hover:border-primary/30 flex items-center justify-center transition-colors"
              title="Crear anuncio"
              aria-label="Crear anuncio"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex-1 p-4 space-y-3">
          {announcements.length > 0 ? (
            announcements.slice(0, 3).map((announcement) => (
              <AnnouncementCard key={`${announcement.scope}-${announcement.id}`} announcement={announcement} compact />
            ))
          ) : (
            <div className="h-full min-h-[190px] flex flex-col items-center justify-center text-center px-6">
              <Megaphone className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mb-3" />
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Sin anuncios por ahora</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Los avisos generales y personales aparecerán aquí.</p>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
          <Button variant="ghost" size="sm" className="w-full gap-2 rounded-lg" onClick={() => openHistory(false)}>
            <History className="w-4 h-4" />
            Ver historial de anuncios
          </Button>
        </div>
      </Card>

      <SlideOver
        open={isOpen}
        onOpenChange={setIsOpen}
        title="Anuncios"
        description="Historial general y mensajes dirigidos exclusivamente a ti"
        icon={<Megaphone className="w-5 h-5 text-primary" />}
        iconBgColor="bg-primary/10 dark:bg-primary/15"
      >
        {canManage && (
          <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-800">
            <div className="p-4 flex justify-end">
              <Button
                variant={isComposerOpen ? 'secondary' : 'default'}
                className="gap-2 rounded-lg"
                onClick={() => {
                  if (isComposerOpen) {
                    resetComposer();
                    setIsComposerOpen(false);
                  } else {
                    startCreating();
                  }
                }}
              >
                {isComposerOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {isComposerOpen ? 'Cerrar editor' : 'Nuevo anuncio'}
              </Button>
            </div>

            {isComposerOpen && (
              <div className="px-4 pb-5 space-y-4">
                {editingAnnouncement ? (
                  <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 dark:bg-primary/10 px-4 py-3">
                    <Edit2 className="w-4 h-4 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">Editar anuncio</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {editingAnnouncement.scope === 'GLOBAL' ? 'Anuncio general' : 'Anuncio personal'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="inline-flex w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-1">
                      {[
                        { value: 'GLOBAL', label: 'Anuncio general' },
                        { value: 'MEMBER', label: 'Una persona' }
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setScope(option.value)}
                          className={cn(
                            'flex-1 min-h-9 rounded-md px-3 text-sm font-semibold transition-colors',
                            scope === option.value
                              ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-sm'
                              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    {scope === 'MEMBER' && (
                      <label className="block">
                        <span className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300 mb-2">Destinatario</span>
                        <select
                          value={targetUserId}
                          onChange={(event) => setTargetUserId(event.target.value)}
                          className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          <option value="">Seleccionar persona</option>
                          {activeMembers.map((member) => (
                            <option key={member.userId} value={member.userId}>{member.name} - {member.role}</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </>
                )}

                <div className="relative">
                  <RichTextEditor
                    ref={editorRef}
                    value={content}
                    onChange={setContent}
                    onTextChange={setPlainText}
                    onSend={handleSubmit}
                    placeholder={editingAnnouncement ? 'Actualiza el contenido del anuncio...' : scope === 'GLOBAL' ? 'Escribe un anuncio para todo el equipo...' : 'Escribe un anuncio personal...'}
                    teamMembers={activeMembers}
                    emojiAction={(
                      <button
                        type="button"
                        onClick={() => setShowEmojiPicker((current) => !current)}
                        className="w-9 h-9 flex items-center justify-center rounded-lg text-lg text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                        title="Insertar emoji"
                        aria-label="Insertar emoji"
                      >
                        😀
                      </button>
                    )}
                    sendAction={(
                      <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!canPublish || isSubmitting}
                        className={cn(
                          'w-9 h-9 flex items-center justify-center rounded-lg transition-colors',
                          canPublish && !isSubmitting ? 'bg-primary text-white' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400'
                        )}
                        title={editingAnnouncement ? 'Guardar cambios' : 'Publicar anuncio'}
                        aria-label={editingAnnouncement ? 'Guardar cambios' : 'Publicar anuncio'}
                      >
                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </button>
                    )}
                  />

                  {showEmojiPicker && (
                    <div data-side-panel-ignore="true" className="absolute right-2 bottom-12 z-30 w-[280px] max-w-[calc(100vw-3rem)] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl p-2">
                      <div className="grid grid-cols-7 gap-1 max-h-44 overflow-y-auto">
                        {APPROVED_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                              editorRef.current?.insertEmoji(emoji);
                              setShowEmojiPicker(false);
                            }}
                            className="w-9 h-9 flex items-center justify-center rounded-lg text-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {error && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error.message}</p>}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar">
          {announcements.length > 0 ? (
            announcementGroups.map((group) => (
              <div key={group.dateKey}>
                <DateDivider date={group.date} />
                <div className="space-y-3">
                  {group.announcements.map((announcement) => (
                    <AnnouncementCard
                      key={`${announcement.scope}-${announcement.id}`}
                      announcement={announcement}
                      showDate={false}
                      canManage={canManage}
                      onEdit={startEditing}
                      onDelete={requestDelete}
                      isSubmitting={isSubmitting}
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">No hay anuncios en el historial.</div>
          )}
        </div>
      </SlideOver>

      <Dialog
        open={Boolean(deleteCandidate)}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) setDeleteCandidate(null);
        }}
      >
        <DialogContent
          overlayClassName="z-[120]"
          className="z-[121] max-w-md rounded-lg border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950"
        >
          <DialogHeader>
            <div className="w-10 h-10 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-2">
              <Trash2 className="w-5 h-5" />
            </div>
            <DialogTitle className="text-zinc-950 dark:text-white">Eliminar anuncio</DialogTitle>
            <DialogDescription className="text-zinc-500 dark:text-zinc-400 leading-6">
              Este anuncio dejará de aparecer en el dashboard y en su historial. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error.message}</p>}
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button variant="outline" className="rounded-lg" disabled={isSubmitting} onClick={() => setDeleteCandidate(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" className="rounded-lg gap-2" disabled={isSubmitting} onClick={confirmDelete}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Eliminar anuncio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DashboardAnnouncements;
