export const runEditorFormat = (editor, command) => {
    if (!editor) return false;
    return command(editor.chain().focus()).run();
};

export const runEditorHeadingFormat = (editor, level) => {
    if (!editor) return false;

    const selection = editor.state?.selection;
    const hasSelection = selection && selection.empty === false;
    const currentBlockText = selection?.$from?.parent?.textContent?.trim() || '';
    const isSameHeadingActive = editor.isActive?.('heading', { level }) ?? false;
    const shouldStartNextBlock = !hasSelection && currentBlockText.length > 0 && !isSameHeadingActive;

    if (shouldStartNextBlock) {
        return editor.chain().focus().splitBlock().setHeading({ level }).run();
    }

    return editor.chain().focus().toggleHeading({ level }).run();
};
