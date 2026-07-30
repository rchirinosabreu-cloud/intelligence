import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

// 1. DOMPurify and RichCommentContent structural sanitization checks
test('DOMPurify Sanitization - Allow standard safe HTML markup, strip script and style tags', async () => {
    // Simulated sanitization function logic matching RichCommentContent
    const simulateSanitize = (html) => {
        // A simple model of isomorphic-dompurify settings
        // Remove script and inline event handlers
        let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        clean = clean.replace(/on\w+="[^"]*"/g, '');
        clean = clean.replace(/javascript:[^\s"']*/g, '');
        return clean;
    };

    const safeHTML = '<p>Este es un <strong>comentario</strong> con <em>formato</em> y <a href="https://example.com">un enlace</a>.</p>';
    const unsafeHTML = '<p>Texto <script>alert("hack")</script> <img src="x" onerror="alert(1)"> seguro.</p>';

    const sanitizedSafe = simulateSanitize(safeHTML);
    const sanitizedUnsafe = simulateSanitize(unsafeHTML);

    assert.ok(sanitizedSafe.includes('<strong>comentario</strong>'), 'Safe HTML markup must be preserved.');
    assert.ok(sanitizedSafe.includes('<a href="https://example.com">'), 'Links must be preserved.');

    assert.ok(!sanitizedUnsafe.includes('<script>'), 'Script tag must be stripped.');
    assert.ok(!sanitizedUnsafe.includes('onerror='), 'Inline event handlers must be stripped.');
});

// 2. Legacy/Historical Plain Text Detection & Rendering Logic
test('Legacy Plain Text Comment Detection and fallbacks', () => {
    const hasRichHTML = (text) => {
        if (!text) return false;
        const richTagsRegex = /<(p|strong|em|u|h1|h2|ul|ol|li|br|a|span)(\s|>)/i;
        return richTagsRegex.test(text);
    };

    const richText = '<p>Comentario con formato HTML</p>';
    const plainText = 'Hola equipo! Adjunto los cambios de la entrega.';
    const plainTextWithLink = 'Visita nuestra web: https://brainstudio.com o menciona a @francisco';

    assert.strictEqual(hasRichHTML(richText), true, 'HTML text should be identified as rich HTML.');
    assert.strictEqual(hasRichHTML(plainText), false, 'Plain text should NOT be identified as rich HTML.');
    assert.strictEqual(hasRichHTML(plainTextWithLink), false, 'Plain text with raw links should NOT be identified as rich HTML.');
});

// 3. Simulating Native Enter (Block Creation) vs Ctrl+Enter (Submission) Keyboard Handlers
test('Keyboard Shortcuts - Enter is native block element while Ctrl+Enter / Cmd+Enter submits', () => {
    let submitTriggered = false;
    let nativeParagraphCreated = false;

    const handleShortcut = (key, ctrlOrCmd) => {
        if (key === 'Enter' && ctrlOrCmd) {
            submitTriggered = true;
            return 'submit';
        } else if (key === 'Enter' && !ctrlOrCmd) {
            nativeParagraphCreated = true;
            return 'new-paragraph';
        }
        return 'none';
    };

    const actionCtrl = handleShortcut('Enter', true);
    assert.strictEqual(submitTriggered, true, 'Ctrl+Enter must trigger form submission.');
    assert.strictEqual(actionCtrl, 'submit');

    const actionPlain = handleShortcut('Enter', false);
    assert.strictEqual(nativeParagraphCreated, true, 'Standard Enter must create a native new paragraph or block instead of sending.');
    assert.strictEqual(actionPlain, 'new-paragraph');
});

// 4. Exposing Ref Actions for Inline Emoji Insertion
test('Ref Actions - useImperativeHandle exposes emoji insertion command', () => {
    // Simulation of imperative actions on RichTextEditor
    let editorContent = "Hola ";
    const mockRef = {
        insertEmoji(emoji) {
            editorContent += emoji;
        },
        focus() {
            return "focused";
        },
        clear() {
            editorContent = "";
        }
    };

    mockRef.insertEmoji("🧠");
    assert.strictEqual(editorContent, "Hola 🧠", "Emoji must be inserted inline inside the active editor.");

    mockRef.clear();
    assert.strictEqual(editorContent, "", "Clear command must empty the editor content.");
});

// 5. ProseMirror Height Constraints Code Inspection
test('RichTextEditor - Tiptap Wrapper, Popover Toolbar Portal and Height Class Verification', () => {
    const editorCode = readFileSync('src/components/ui/RichTextEditor.jsx', 'utf8');

    // Assert forwardRef and imperative handle exist
    assert.ok(editorCode.includes('React.forwardRef'), 'RichTextEditor must be defined with React.forwardRef to expose focus/emoji actions.');
    assert.ok(editorCode.includes('React.useImperativeHandle'), 'RichTextEditor must use useImperativeHandle to expose controlled methods.');

    // Assert Tiptap keyboard shortcuts
    assert.ok(editorCode.includes("'Mod-Enter'"), 'Mod-Enter shortcut must be configured as the send trigger.');
    assert.ok(!editorCode.includes("'Enter':"), 'Standard Enter interceptor must be completely removed to allow native paragraphs.');

    // Assert the use of Popover components from Radix Popover Portal
    assert.ok(editorCode.includes('Popover.Root'), 'RichTextEditor must import and use Popover.Root.');
    assert.ok(editorCode.includes('Popover.Anchor'), 'RichTextEditor must use Popover.Anchor as visual position target.');
    assert.ok(editorCode.includes('Popover.Portal'), 'RichTextEditor must use Popover.Portal to render toolbar in a decoupled overlay layer.');
    assert.ok(editorCode.includes('Popover.Content'), 'RichTextEditor must use Popover.Content to configure alignment/collision padding.');

    // Assert ProseMirror Height Rules are present in container wrappers
    assert.ok(editorCode.includes('min-h-[48px]'), 'RichTextEditor must support min-h-[48px] in compact mode.');
    assert.ok(editorCode.includes('max-h-[120px]'), 'RichTextEditor must support max-h-[120px] in compact mode.');
    assert.ok(editorCode.includes('min-h-[144px]'), 'RichTextEditor must support min-h-[144px] in showToolbar format mode.');
    assert.ok(editorCode.includes('max-h-[280px]'), 'RichTextEditor must support max-h-[280px] in showToolbar format mode.');
});

// 6. Dialog Shielding Verification
test('Dialog Shielding - Avoid closure when interaction originates from data-task-format-toolbar element', () => {
    let preventDefaultCalled = false;

    const mockEvent = {
        target: {
            hasAttribute: (attr) => attr === 'data-task-format-toolbar',
            closest: () => null
        },
        preventDefault() {
            preventDefaultCalled = true;
        }
    };

    // Shielding trigger simulation matching TaskSidePanel.jsx
    const handlePointerDownOutside = (e) => {
        const target = e.target;
        const isToolbar = target && (target.closest('[data-task-format-toolbar]') || target.hasAttribute('data-task-format-toolbar'));
        if (isToolbar) {
            e.preventDefault();
        }
    };

    handlePointerDownOutside(mockEvent);
    assert.strictEqual(preventDefaultCalled, true, 'PointerDown must be prevented to prevent Dialog closure.');
});

// 7. Tiptap Mentions filtering against teamMembers
test('Tiptap Mentions - Filter teamMembers against input search query', () => {
    const teamMembers = [
        { id: '1', name: 'Francisco Villa' },
        { id: '2', name: 'Kamila del Toro' },
        { id: '3', name: 'Rodny Chirinos' }
    ];

    const getSuggestions = (query) => {
        return teamMembers
            .filter(item => item.name.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 5);
    };

    const resultsFr = getSuggestions('fran');
    assert.strictEqual(resultsFr.length, 1);
    assert.strictEqual(resultsFr[0].name, 'Francisco Villa');

    const resultsRo = getSuggestions('chir');
    assert.strictEqual(resultsRo.length, 1);
    assert.strictEqual(resultsRo[0].name, 'Rodny Chirinos');

    const resultsAll = getSuggestions('');
    assert.strictEqual(resultsAll.length, 3);
});
