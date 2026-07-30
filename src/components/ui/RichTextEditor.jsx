import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';
import { Extension } from '@tiptap/core';
import * as Popover from '@radix-ui/react-popover';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import ComposerActionLayout from '@/components/ui/ComposerActionLayout';
import TopToolbarSurface from '@/components/ui/TopToolbarSurface';

// Custom Tiptap extension to handle Mod-Enter (Ctrl+Enter / Cmd+Enter) key action
const CustomKeymap = Extension.create({
  name: 'customKeymap',
  addOptions() {
    return {
      onSendRef: null,
    };
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => {
        if (this.options.onSendRef && this.options.onSendRef.current) {
          this.options.onSendRef.current();
          return true;
        }
        return false;
      },
    };
  },
});

const RichTextEditor = React.forwardRef(({
  value,
  onChange,
  onSend,
  placeholder,
  className,
  showToolbar,
  onToggleToolbar,
  onTextChange,
  teamMembers = [],
  attachmentAction,
  emojiAction,
  sendAction,
}, ref) => {
  // Memorize the onSend callback in a mutable ref to prevent Tiptap editor reconstructions
  const onSendRef = React.useRef(onSend);
  React.useEffect(() => {
    onSendRef.current = onSend;
  }, [onSend]);

  // Keep a mutable reference to teamMembers to avoid Tiptap closure staleness
  const teamMembersRef = React.useRef(teamMembers);
  React.useEffect(() => {
    teamMembersRef.current = teamMembers;
  }, [teamMembers]);

  // Support both controlled and uncontrolled states for the Popover formatting toolbar
  const [internalShowToolbar, setInternalShowToolbar] = React.useState(false);
  const isControlled = showToolbar !== undefined;
  const isToolbarOpen = isControlled ? showToolbar : internalShowToolbar;

  const handleToggleToolbar = (isOpen) => {
    if (onToggleToolbar) {
      onToggleToolbar(isOpen);
    } else {
      setInternalShowToolbar(isOpen);
    }
  };

  // Execute against ProseMirror's live selection. Restoring a selection captured
  // when the toolbar opened makes subsequent formatting jump to an old block.
  const executeFormat = (event, command) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    runEditorFormat(editor, command);
  };

  // React State for native cursor-positioned suggestions list
  const [suggestion, setSuggestion] = React.useState({
    isOpen: false,
    x: 0,
    y: 0,
    items: [],
    selectedIndex: 0,
    command: null,
  });

  const suggestionRef = React.useRef(suggestion);
  React.useEffect(() => {
    suggestionRef.current = suggestion;
  }, [suggestion]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2],
        },
      }),
      Underline,
      Placeholder.configure({
        placeholder: placeholder || 'Escribe un mensaje...',
      }),
      CustomKeymap.configure({
        onSendRef,
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'mention-pill bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 rounded-full font-bold px-1.5 py-0.5 mx-0.5 select-all shadow-sm',
          'data-type': 'mention',
        },
        suggestion: {
          char: '@',
          items: ({ query }) => {
            return (teamMembersRef.current || [])
              .filter(item => item.name.toLowerCase().includes(query.toLowerCase()))
              .slice(0, 5);
          },
          render: () => {
            return {
              onStart: (props) => {
                const rect = props.clientRect ? props.clientRect() : null;
                setSuggestion({
                  isOpen: true,
                  x: rect ? rect.left : 0,
                  y: rect ? rect.bottom + window.scrollY : 0,
                  items: props.items,
                  selectedIndex: 0,
                  command: props.command,
                });
                // Auto-hide the formatting toolbar to prevent Visual Overlay Conflicts
                handleToggleToolbar(false);
              },
              onUpdate: (props) => {
                const rect = props.clientRect ? props.clientRect() : null;
                setSuggestion((prev) => ({
                  ...prev,
                  items: props.items,
                  x: rect ? rect.left : prev.x,
                  y: rect ? rect.bottom + window.scrollY : prev.y,
                  selectedIndex: 0,
                }));
              },
              onKeyDown: (props) => {
                const current = suggestionRef.current;
                if (!current.isOpen || !current.items.length) return false;

                if (props.event.key === 'ArrowDown') {
                  const nextIndex = (current.selectedIndex + 1) % current.items.length;
                  setSuggestion(prev => ({ ...prev, selectedIndex: nextIndex }));
                  return true;
                }
                if (props.event.key === 'ArrowUp') {
                  const nextIndex = (current.selectedIndex - 1 + current.items.length) % current.items.length;
                  setSuggestion(prev => ({ ...prev, selectedIndex: nextIndex }));
                  return true;
                }
                if (props.event.key === 'Enter') {
                  const selectedItem = current.items[current.selectedIndex];
                  if (selectedItem && current.command) {
                    current.command({ id: selectedItem.id, label: selectedItem.name });
                    return true;
                  }
                }
                if (props.event.key === 'Escape') {
                  setSuggestion({ isOpen: false, items: [], selectedIndex: 0, command: null });
                  return true;
                }
                return false;
              },
              onExit: () => {
                setSuggestion({ isOpen: false, items: [], selectedIndex: 0, command: null });
              },
            };
          },
        },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: cn(
          "w-full text-sm font-medium outline-none prose dark:prose-invert max-w-none text-zinc-800 dark:text-zinc-200 px-4 py-3 pb-12",
          "focus:outline-none focus-visible:outline-none [&_.ProseMirror]:outline-none"
        ),
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const plainText = editor.getText().trim();
      onChange(html);
      if (onTextChange) {
        onTextChange(plainText);
      }
    },
  }, []); // Run exact ONCE on mount, preventing reconstruction on prop changes!

  // Expose imperatively controlled functions via Ref
  React.useImperativeHandle(ref, () => ({
    insertEmoji(emoji) {
      if (editor) {
        editor
          .chain()
          .focus()
          .insertContent(emoji)
          .run();
      }
    },
    focus() {
      if (editor) {
        editor.commands.focus();
      }
    },
    clear() {
      if (editor) {
        editor.commands.clearContent();
      }
    }
  }));

  // Sync value if changed from outside (e.g. cleared on successful comment post)
  React.useEffect(() => {
    if (editor) {
      const currentHtml = editor.getHTML();
      if (value === "" || value === null || value === undefined) {
        if (currentHtml !== "") {
          editor.commands.setContent("");
          if (onTextChange) onTextChange("");
        }
      } else if (currentHtml !== value) {
        editor.commands.setContent(value);
        if (onTextChange) onTextChange(editor.getText().trim());
      }
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <Popover.Root open={isToolbarOpen} onOpenChange={handleToggleToolbar}>
      <div className={cn("relative w-full flex h-12 flex-col justify-end", isToolbarOpen && "z-20")}>
        <Popover.Anchor asChild>
          <div className={cn(
            "w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus-within:border-primary/30 rounded-xl shadow-inner transition-all relative flex flex-col justify-end",
            isToolbarOpen && "absolute inset-x-0 bottom-0 min-h-[144px]",
            className
          )}>
            {/* Dynamic heights and scroll wrapped at React container level instead of Tiptap editorProps */}
            <div className={cn(
              "w-full overflow-y-auto transition-[min-height] duration-200 ease-in-out scrollbar-thin",
              "min-h-[48px] max-h-[120px]",
              isToolbarOpen && "min-h-[144px] max-h-[280px]",
              "[&_.ProseMirror]:min-h-full [&_.ProseMirror]:focus:outline-none"
            )}>
              <EditorContent editor={editor} />
            </div>
          </div>
        </Popover.Anchor>

        <ComposerActionLayout
          attachmentAction={attachmentAction}
          formatAction={(
            <Popover.Trigger asChild>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              className={cn(
                "w-9 h-9 flex items-center justify-center rounded-lg text-xs font-bold transition-all select-none hover:bg-zinc-200 dark:hover:bg-zinc-800",
                isToolbarOpen ? "text-primary bg-primary/10" : "text-zinc-400"
              )}
              title="Formato"
              aria-label="Opciones de formato"
            >
              A
            </button>
            </Popover.Trigger>
          )}
          emojiAction={emojiAction}
          sendAction={sendAction}
        />
      </div>

      {isToolbarOpen && (
        <TopToolbarSurface>
          <button
            type="button"
            onMouseDown={(e) => executeFormat(e, chain => chain.toggleBold())}
            className={cn(
              "px-2 py-1 rounded text-xs font-bold transition-all select-none hover:bg-zinc-100 dark:hover:bg-zinc-800",
              editor.isActive('bold') ? "bg-primary/10 text-primary" : "text-zinc-500"
            )}
            title="Negrita"
          >
            B
          </button>
          <button
            type="button"
            onMouseDown={(e) => executeFormat(e, chain => chain.toggleItalic())}
            className={cn(
              "px-2 py-1 rounded text-xs italic transition-all select-none hover:bg-zinc-100 dark:hover:bg-zinc-800",
              editor.isActive('italic') ? "bg-primary/10 text-primary" : "text-zinc-500"
            )}
            title="Cursiva"
          >
            I
          </button>
          <button
            type="button"
            onMouseDown={(e) => executeFormat(e, chain => chain.toggleUnderline())}
            className={cn(
              "px-2 py-1 rounded text-xs underline transition-all select-none hover:bg-zinc-100 dark:hover:bg-zinc-800",
              editor.isActive('underline') ? "bg-primary/10 text-primary" : "text-zinc-500"
            )}
            title="Subrayado"
          >
            U
          </button>
          <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1" />
          <button
            type="button"
            onMouseDown={(e) => executeFormat(e, chain => chain.toggleHeading({ level: 1 }))}
            className={cn(
              "px-2 py-1 rounded text-xs font-bold transition-all select-none hover:bg-zinc-100 dark:hover:bg-zinc-800",
              editor.isActive('heading', { level: 1 }) ? "bg-primary/10 text-primary" : "text-zinc-500"
            )}
            title="Título 1"
          >
            H1
          </button>
          <button
            type="button"
            onMouseDown={(e) => executeFormat(e, chain => chain.toggleHeading({ level: 2 }))}
            className={cn(
              "px-2 py-1 rounded text-xs font-bold transition-all select-none hover:bg-zinc-100 dark:hover:bg-zinc-800",
              editor.isActive('heading', { level: 2 }) ? "bg-primary/10 text-primary" : "text-zinc-500"
            )}
            title="Título 2"
          >
            H2
          </button>
          <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1" />
          <button
            type="button"
            onMouseDown={(e) => executeFormat(e, chain => chain.toggleBulletList())}
            className={cn(
              "px-2 py-1 rounded text-xs font-bold transition-all select-none hover:bg-zinc-100 dark:hover:bg-zinc-800",
              editor.isActive('bulletList') ? "bg-primary/10 text-primary" : "text-zinc-500"
            )}
            title="Lista de Viñetas"
          >
            • Lista
          </button>
          <button
            type="button"
            onMouseDown={(e) => executeFormat(e, chain => chain.toggleOrderedList())}
            className={cn(
              "px-2 py-1 rounded text-xs font-bold transition-all select-none hover:bg-zinc-100 dark:hover:bg-zinc-800",
              editor.isActive('orderedList') ? "bg-primary/10 text-primary" : "text-zinc-500"
            )}
            title="Lista Numerada"
          >
            1. Lista
          </button>
        </TopToolbarSurface>
      )}

      {/* Render suggestion list inside React Portal anchored dynamically to parsed cursor coordinates */}
      {suggestion.isOpen && suggestion.items.length > 0 && createPortal(
        <div
          style={{
            position: 'absolute',
            left: `${suggestion.x}px`,
            top: `${suggestion.y + 4}px`,
          }}
          className="z-[9999] w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl p-1.5 flex flex-col max-h-60 overflow-y-auto"
        >
          {suggestion.items.map((member, idx) => (
            <button
              key={member.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (suggestion.command) {
                  suggestion.command({ id: member.id, label: member.name });
                }
              }}
              className={cn(
                "w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                suggestion.selectedIndex === idx
                  ? "bg-primary text-white"
                  : "text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              )}
            >
              <span className="truncate">{member.name}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </Popover.Root>
  );
});

RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;
