export const runEditorFormat = (editor, command) => {
    if (!editor) return false;
    return command(editor.chain().focus()).run();
};
