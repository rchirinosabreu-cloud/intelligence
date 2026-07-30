import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { Extension } from '@tiptap/core';
import * as Popover from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';

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

const RichTextEditor = React.forwardRef(({ value, onChange, onSend, placeholder, className, showToolbar, onToggleToolbar, onTextChange }, ref) => {
  // Memorize the onSend callback in a mutable ref to prevent Tiptap editor reconstructions
  const onSendRef = React.useRef(onSend);
  React.useEffect(() => {
    onSendRef.current = onSend;
  }, [onSend]);

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
    ],
    content: value,
    editorProps: {
      attributes: {
        class: cn(
          "w-full text-sm font-medium outline-none prose dark:prose-invert max-w-none text-zinc-800 dark:text-zinc-200 px-4 py-3",
          "focus:outline-none focus-visible:outline-none [&_.ProseMirror]:outline-none",
          "min-h-[48px] max-h-[120px] overflow-y-auto transition-[min-height] duration-200 ease-in-out",
          showToolbar && "min-h-[144px] max-h-[280px]"
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
    <Popover.Root open={showToolbar} onOpenChange={onToggleToolbar}>
      <Popover.Anchor asChild>
        <div className={cn(
          "w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus-within:border-primary/30 rounded-xl shadow-inner transition-all relative flex flex-col",
          className
        )}>
          <EditorContent editor={editor} />
        </div>
      </Popover.Anchor>

      <Popover.Portal>
        <Popover.Content
          side="top"
          align="center"
          sideOffset={8}
          collisionPadding={16}
          avoidCollisions
          className="flex flex-wrap items-center gap-1.5 p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg z-[120] animate-in slide-in-from-bottom-2 duration-150"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
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
            onClick={() => editor.chain().focus().toggleItalic().run()}
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
            onClick={() => editor.chain().focus().toggleUnderline().run()}
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
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
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
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
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
            onClick={() => editor.chain().focus().toggleBulletList().run()}
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
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={cn(
              "px-2 py-1 rounded text-xs font-bold transition-all select-none hover:bg-zinc-100 dark:hover:bg-zinc-800",
              editor.isActive('orderedList') ? "bg-primary/10 text-primary" : "text-zinc-500"
            )}
            title="Lista Numerada"
          >
            1. Lista
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
});

RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;
