import React, { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { Bold, Italic, Underline as UnderlineIcon, Heading1, Heading2, List, ListOrdered } from 'lucide-react';
import { cn } from '@/lib/utils';

const RichTextEditor = ({
    value,
    onChange,
    onSubmit,
    placeholder,
    onEditorReady,
    showToolbar = false,
    isEdition = false
}) => {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                // Configure heading to support standard H1 and H2
                heading: {
                    levels: [1, 2],
                },
            }),
            Underline,
        ],
        content: value,
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());

            // Handle @ mentions typing detection
            const { selection } = editor.state;
            const { from } = selection;
            const textBeforeCursor = editor.state.doc.textBetween(0, from, ' ');
            const atIndex = textBeforeCursor.lastIndexOf('@');

            if (atIndex !== -1 && (atIndex === 0 || /\s/.test(textBeforeCursor[atIndex - 1]))) {
                const query = textBeforeCursor.slice(atIndex + 1);
                if (!/\s/.test(query)) {
                    // Notify parent of typing mention
                    window.dispatchEvent(new CustomEvent('editor-mention-type', {
                        detail: { query, atIndex }
                    }));
                    return;
                }
            }
            window.dispatchEvent(new CustomEvent('editor-mention-hide'));
        },
        editorProps: {
            attributes: {
                className: cn(
                    'prose dark:prose-invert max-w-none text-xs font-medium outline-none',
                    'py-3 px-12 pr-28 no-scrollbar min-h-[48px] max-h-[160px] overflow-y-auto w-full',
                    'focus:ring-0 focus:outline-none',
                    '[&_p]:my-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-bold',
                    '[&_h1]:text-sm [&_h1]:font-black [&_h1]:uppercase [&_h1]:tracking-wider [&_h1]:my-1',
                    '[&_h2]:text-xs [&_h2]:font-black [&_h2]:uppercase [&_h2]:tracking-wider [&_h2]:my-1'
                ),
            },
            handleKeyDown: (view, event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    onSubmit();
                    return true;
                }
                return false;
            }
        }
    });

    // Sync external clears or changes
    useEffect(() => {
        if (editor) {
            const currentHTML = editor.getHTML();
            if (value !== currentHTML) {
                if (value === '' || value === '<p></p>') {
                    editor.commands.setContent('');
                }
            }
        }
    }, [value, editor]);

    // Pass editor instance up
    useEffect(() => {
        if (editor && onEditorReady) {
            onEditorReady(editor);
        }
    }, [editor, onEditorReady]);

    if (!editor) {
        return null;
    }

    return (
        <div className="w-full flex flex-col bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus-within:border-primary/30 rounded-xl overflow-hidden transition-all shadow-inner relative">
            {/* Toolbar */}
            {showToolbar && (
                <div className="flex items-center gap-0.5 p-1 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/50 shrink-0 select-none">
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        className={cn(
                            "p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-850 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-250 transition-all",
                            editor.isActive('bold') && "bg-zinc-200 dark:bg-zinc-800 text-primary dark:text-primary-foreground font-bold"
                        )}
                        title="Negrita (Ctrl+B)"
                    >
                        <Bold size={13} />
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        className={cn(
                            "p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-850 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-250 transition-all",
                            editor.isActive('italic') && "bg-zinc-200 dark:bg-zinc-800 text-primary dark:text-primary-foreground font-bold"
                        )}
                        title="Cursiva (Ctrl+I)"
                    >
                        <Italic size={13} />
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                        className={cn(
                            "p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-850 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-250 transition-all",
                            editor.isActive('underline') && "bg-zinc-200 dark:bg-zinc-800 text-primary dark:text-primary-foreground font-bold"
                        )}
                        title="Subrayado (Ctrl+U)"
                    >
                        <UnderlineIcon size={13} />
                    </button>

                    <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1" />

                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                        className={cn(
                            "p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-850 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-250 transition-all",
                            editor.isActive('heading', { level: 1 }) && "bg-zinc-200 dark:bg-zinc-800 text-primary dark:text-primary-foreground font-bold"
                        )}
                        title="Título 1"
                    >
                        <Heading1 size={13} />
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                        className={cn(
                            "p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-850 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-250 transition-all",
                            editor.isActive('heading', { level: 2 }) && "bg-zinc-200 dark:bg-zinc-800 text-primary dark:text-primary-foreground font-bold"
                        )}
                        title="Título 2"
                    >
                        <Heading2 size={13} />
                    </button>

                    <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1" />

                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        className={cn(
                            "p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-850 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-250 transition-all",
                            editor.isActive('bulletList') && "bg-zinc-200 dark:bg-zinc-800 text-primary dark:text-primary-foreground font-bold"
                        )}
                        title="Lista de viñetas"
                    >
                        <List size={13} />
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        className={cn(
                            "p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-850 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-250 transition-all",
                            editor.isActive('orderedList') && "bg-zinc-200 dark:bg-zinc-800 text-primary dark:text-primary-foreground font-bold"
                        )}
                        title="Lista numerada"
                    >
                        <ListOrdered size={13} />
                    </button>
                </div>
            )}

            {/* Input area */}
            <div className="relative w-full">
                {/* Custom Placeholder */}
                {editor.isEmpty && (
                    <div className="absolute left-12 top-3 text-zinc-400 dark:text-zinc-500 pointer-events-none select-none text-xs font-medium">
                        {isEdition ? "Escribe un mensaje al equipo..." : "Escribe un mensaje inicial..."}
                    </div>
                )}
                <EditorContent editor={editor} />
            </div>
        </div>
    );
};

export default RichTextEditor;
