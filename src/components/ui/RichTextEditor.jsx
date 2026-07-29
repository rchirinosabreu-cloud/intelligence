import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { Extension } from '@tiptap/core';
import { cn } from '@/lib/utils';

// Custom Tiptap extension to handle Enter / Ctrl+Enter key actions
const CustomKeymap = Extension.create({
  name: 'customKeymap',
  addOptions() {
    return {
      onSend: null,
    };
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => {
        if (this.options.onSend) {
          this.options.onSend();
          return true;
        }
        return false;
      },
      'Enter': ({ editor }) => {
        const isList = editor.isActive('bulletList') || editor.isActive('orderedList');
        const isHeading = editor.isActive('heading');
        if (isList || isHeading) {
          return false; // Let native Enter create new list items or headings
        }
        if (this.options.onSend) {
          this.options.onSend();
          return true;
        }
        return false;
      },
    };
  },
});

const RichTextEditor = ({ value, onChange, onSend, placeholder, className, showToolbar, onToggleToolbar }) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2],
        },
      }),
      Underline,
      CustomKeymap.configure({
        onSend,
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: cn(
          "w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus-within:border-primary/30 rounded-xl px-12 py-3 pr-28 text-sm font-medium outline-none transition-all min-h-[48px] shadow-inner prose dark:prose-invert max-w-none text-zinc-800 dark:text-zinc-200",
          className
        ),
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  }, [onSend]);

  // Sync value if changed from outside (e.g. cleared on successful comment post)
  React.useEffect(() => {
    if (editor && editor.getHTML() !== value) {
      editor.commands.setContent(value || '');
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div className="w-full flex flex-col relative">
      {/* Tiptap Toolbar (toggleable with button 'A') */}
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-1.5 p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg mb-2 animate-in slide-in-from-bottom-2 duration-150">
          <button
            type="button"
            onClick={() => editor.commands.toggleBold()}
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
            onClick={() => editor.commands.toggleItalic()}
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
            onClick={() => editor.commands.toggleUnderline()}
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
            onClick={() => editor.commands.toggleHeading({ level: 1 })}
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
            onClick={() => editor.commands.toggleHeading({ level: 2 })}
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
            onClick={() => editor.commands.toggleBulletList()}
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
            onClick={() => editor.commands.toggleOrderedList()}
            className={cn(
              "px-2 py-1 rounded text-xs font-bold transition-all select-none hover:bg-zinc-100 dark:hover:bg-zinc-800",
              editor.isActive('orderedList') ? "bg-primary/10 text-primary" : "text-zinc-500"
            )}
            title="Lista Numerada"
          >
            1. Lista
          </button>
        </div>
      )}

      {/* Editor Content Area */}
      <div className="relative w-full">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

export default RichTextEditor;
