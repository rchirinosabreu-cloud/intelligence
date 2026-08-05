import React from 'react';
import * as Popover from '@radix-ui/react-popover';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';
import Underline from '@tiptap/extension-underline';
import { Extension, Mark, mergeAttributes } from '@tiptap/core';
import { createPortal } from 'react-dom';
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Underline as UnderlineIcon,
} from 'lucide-react';
import { runEditorFormat, runEditorHeadingFormat } from './editorFormatting';
import { cn } from '@/lib/utils';
import ComposerActionLayout from '@/components/ui/ComposerActionLayout';
import TopToolbarSurface from '@/components/ui/TopToolbarSurface';

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
        if (this.options.onSendRef?.current) {
          this.options.onSendRef.current();
          return true;
        }
        return false;
      },
    };
  },
});

const Highlight = Mark.create({
  name: 'highlight',

  parseHTML() {
    return [
      { tag: 'mark' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      toggleHighlight: () => ({ commands }) => commands.toggleMark(this.name),
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
  const editorContentClassName = className;
  const onSendRef = React.useRef(onSend);
  React.useEffect(() => {
    onSendRef.current = onSend;
  }, [onSend]);

  const teamMembersRef = React.useRef(teamMembers);
  React.useEffect(() => {
    teamMembersRef.current = teamMembers;
  }, [teamMembers]);

  const [internalShowToolbar, setInternalShowToolbar] = React.useState(false);
  const isControlled = showToolbar !== undefined;
  const isToolbarOpen = isControlled ? showToolbar : internalShowToolbar;

  const handleToggleToolbar = React.useCallback((isOpen) => {
    if (onToggleToolbar) {
      onToggleToolbar(isOpen);
    } else {
      setInternalShowToolbar(isOpen);
    }
  }, [onToggleToolbar]);

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
          levels: [1, 2, 3],
        },
      }),
      Underline,
      Highlight,
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
          render: () => ({
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
              handleToggleToolbar(false);
            },
            onUpdate: (props) => {
              const rect = props.clientRect ? props.clientRect() : null;
              setSuggestion(prev => ({
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
          }),
        },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: cn(
          'w-full text-sm font-medium outline-none prose dark:prose-invert max-w-none text-zinc-800 dark:text-zinc-200 px-4 py-3 pb-12',
          'focus:outline-none focus-visible:outline-none [&_.ProseMirror]:outline-none',
          editorContentClassName
        ),
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const html = currentEditor.getHTML();
      const plainText = currentEditor.getText().trim();
      onChange(html);
      if (onTextChange) {
        onTextChange(plainText);
      }
    },
  }, []);

  const formattingState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      bold: currentEditor?.isActive('bold') ?? false,
      italic: currentEditor?.isActive('italic') ?? false,
      underline: currentEditor?.isActive('underline') ?? false,
      highlight: currentEditor?.isActive('highlight') ?? false,
      heading1: currentEditor?.isActive('heading', { level: 1 }) ?? false,
      heading2: currentEditor?.isActive('heading', { level: 2 }) ?? false,
      heading3: currentEditor?.isActive('heading', { level: 3 }) ?? false,
      bulletList: currentEditor?.isActive('bulletList') ?? false,
      orderedList: currentEditor?.isActive('orderedList') ?? false,
    }),
  });

  const composerRef = React.useRef(null);
  React.useLayoutEffect(() => {
    if (!isToolbarOpen) return undefined;

    const keepComposerBottomVisible = () => {
      composerRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };

    keepComposerBottomVisible();
    const frameId = requestAnimationFrame(keepComposerBottomVisible);
    const timeoutId = window.setTimeout(keepComposerBottomVisible, 220);

    return () => {
      cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [isToolbarOpen]);

  const executeFormat = (event, command) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    runEditorFormat(editor, command);
  };

  const executeHeadingFormat = (event, level) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    runEditorHeadingFormat(editor, level);
  };

  React.useImperativeHandle(ref, () => ({
    insertEmoji(emoji) {
      editor?.chain().focus().insertContent(emoji).run();
    },
    focus() {
      editor?.commands.focus();
    },
    clear() {
      editor?.commands.clearContent();
    },
  }));

  React.useEffect(() => {
    if (!editor) return;

    const currentHtml = editor.getHTML();
    if (value === '' || value === null || value === undefined) {
      if (currentHtml !== '') {
        editor.commands.setContent('');
        if (onTextChange) onTextChange('');
      }
    } else if (currentHtml !== value) {
      editor.commands.setContent(value);
      if (onTextChange) onTextChange(editor.getText().trim());
    }
  }, [value, editor, onTextChange]);

  if (!editor) return null;

  const formatButtonClass = (isActive) => cn(
    'h-8 min-w-8 px-2 rounded-lg text-xs font-bold transition-all select-none inline-flex items-center justify-center gap-1.5',
    'hover:bg-zinc-100 dark:hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
    isActive ? 'bg-primary/10 text-primary' : 'text-zinc-500 dark:text-zinc-400'
  );

  return (
    <Popover.Root open={isToolbarOpen} onOpenChange={handleToggleToolbar}>
      <div
        ref={composerRef}
        style={{ scrollMarginBlock: isToolbarOpen ? '120px' : undefined }}
        className={cn('relative w-full flex flex-col justify-end transition-all duration-200 ease-out', isToolbarOpen && 'z-20')}
      >
        <Popover.Anchor asChild>
          <div
            data-rich-text-editor-shell="true"
            className="w-full overflow-hidden bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus-within:border-primary/30 rounded-xl shadow-inner transition-all relative flex flex-col justify-end"
          >
            {isToolbarOpen && (
              <TopToolbarSurface>
                <button type="button" aria-label="Negrita" aria-pressed={formattingState.bold} onMouseDown={(e) => executeFormat(e, chain => chain.toggleBold())} className={formatButtonClass(formattingState.bold)} title="Negrita">
                  <Bold className="h-4 w-4" />
                </button>
                <button type="button" aria-label="Cursiva" aria-pressed={formattingState.italic} onMouseDown={(e) => executeFormat(e, chain => chain.toggleItalic())} className={formatButtonClass(formattingState.italic)} title="Cursiva">
                  <Italic className="h-4 w-4" />
                </button>
                <button type="button" aria-label="Subrayado" aria-pressed={formattingState.underline} onMouseDown={(e) => executeFormat(e, chain => chain.toggleUnderline())} className={formatButtonClass(formattingState.underline)} title="Subrayado">
                  <UnderlineIcon className="h-4 w-4" />
                </button>
                <button type="button" aria-label="Resaltado" aria-pressed={formattingState.highlight} onMouseDown={(e) => executeFormat(e, chain => chain.toggleHighlight())} className={formatButtonClass(formattingState.highlight)} title="Resaltado">
                  <Highlighter className="h-4 w-4" />
                </button>
                <div className="mx-1 h-5 w-px shrink-0 bg-zinc-200 dark:bg-zinc-800" />
                <button type="button" aria-label="Titulo 1" aria-pressed={formattingState.heading1} onMouseDown={(e) => executeHeadingFormat(e, 1)} className={formatButtonClass(formattingState.heading1)} title="Titulo 1">
                  <Heading1 className="h-4 w-4" />
                </button>
                <button type="button" aria-label="Titulo 2" aria-pressed={formattingState.heading2} onMouseDown={(e) => executeHeadingFormat(e, 2)} className={formatButtonClass(formattingState.heading2)} title="Titulo 2">
                  <Heading2 className="h-4 w-4" />
                </button>
                <button type="button" aria-label="Titulo 3" aria-pressed={formattingState.heading3} onMouseDown={(e) => executeHeadingFormat(e, 3)} className={formatButtonClass(formattingState.heading3)} title="Titulo 3">
                  <Heading3 className="h-4 w-4" />
                </button>
                <div className="mx-1 h-5 w-px shrink-0 bg-zinc-200 dark:bg-zinc-800" />
                <button type="button" aria-label="Lista con bullets" aria-pressed={formattingState.bulletList} onMouseDown={(e) => executeFormat(e, chain => chain.toggleBulletList())} className={formatButtonClass(formattingState.bulletList)} title="Lista con bullets">
                  <List className="h-4 w-4" />
                </button>
                <button type="button" aria-label="Lista numerada" aria-pressed={formattingState.orderedList} onMouseDown={(e) => executeFormat(e, chain => chain.toggleOrderedList())} className={formatButtonClass(formattingState.orderedList)} title="Lista numerada">
                  <ListOrdered className="h-4 w-4" />
                </button>
              </TopToolbarSurface>
            )}

            <div className={cn(
              'w-full overflow-y-auto overscroll-contain transition-[min-height,max-height] duration-200 ease-in-out scrollbar-thin',
              'min-h-[48px] max-h-[120px]',
              isToolbarOpen && 'min-h-[144px] max-h-[min(42vh,260px)]',
              '[&_.ProseMirror]:min-h-full [&_.ProseMirror]:break-all [&_.ProseMirror]:focus:outline-none'
            )}>
              <EditorContent editor={editor} />
            </div>

            <ComposerActionLayout
              attachmentAction={attachmentAction}
              formatAction={(
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    className={cn(
                      'w-9 h-9 flex items-center justify-center rounded-lg text-xs font-bold transition-all select-none hover:bg-zinc-200 dark:hover:bg-zinc-800',
                      isToolbarOpen ? 'text-primary bg-primary/10' : 'text-zinc-400'
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
        </Popover.Anchor>
      </div>

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
                'w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2',
                suggestion.selectedIndex === idx
                  ? 'bg-primary text-white'
                  : 'text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
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
