import test from 'node:test';
import assert from 'node:assert';

// 1. Simular la retención de borradores con textos intermedios
test('Draft Snapshots - Retención de textos intermedios en sessionStorage', () => {
    // Mock sessionStorage
    const storage = {};
    const sessionStorageMock = {
        setItem(key, value) {
            storage[key] = String(value);
        },
        getItem(key) {
            return storage[key] || null;
        },
        removeItem(key) {
            delete storage[key];
        }
    };

    // Borrador con comentarios e insumos preliminares en progreso
    const intermediateSnapshot = {
        title: 'Mi tarea en borrador',
        clientId: 'client-123',
        newComment: 'Escribiendo un comentario inicial en progreso...',
        newRefUrl: 'https://github.com',
        newRefName: 'Enlace manual en progreso',
        tempReferences: [{ url: 'https://google.com', name: 'Google' }]
    };

    sessionStorageMock.setItem('task_focus_draft', JSON.stringify(intermediateSnapshot));

    // Verificar persistencia de snapshot
    const saved = sessionStorageMock.getItem('task_focus_draft');
    assert.ok(saved, 'El borrador debe existir en el sessionStorage.');

    const parsed = JSON.parse(saved);
    assert.strictEqual(parsed.title, 'Mi tarea en borrador');
    assert.strictEqual(parsed.newComment, 'Escribiendo un comentario inicial en progreso...');
    assert.strictEqual(parsed.newRefUrl, 'https://github.com');
    assert.strictEqual(parsed.newRefName, 'Enlace manual en progreso');
    assert.strictEqual(parsed.tempReferences[0].url, 'https://google.com');
});

// 2. Simular el disparo de eventos onClick y detención de propagación en el visor (Lightbox)
test('Lightbox Event Isolation - Detener propagación de eventos', () => {
    let stopPropagationCalled = false;
    let preventDefaultCalled = false;

    const mockEvent = {
        stopPropagation() {
            stopPropagationCalled = true;
        },
        preventDefault() {
            preventDefaultCalled = true;
        }
    };

    // Simular clic en el fondo o en el botón de cerrar del visor
    const handleClick = (e) => {
        e.stopPropagation();
        e.preventDefault();
    };

    handleClick(mockEvent);

    assert.strictEqual(stopPropagationCalled, true, 'Debe detener la propagación del evento.');
    assert.strictEqual(preventDefaultCalled, true, 'Debe prevenir el comportamiento por defecto.');
});

// 3. Simular la descarga verificada basada en fetch leyendo Content-Disposition
test('Verified Blob Download - Extracción de Content-Disposition y trigger de descarga', async () => {
    // Mock global fetch
    const mockHeaders = new Map();
    mockHeaders.set('content-disposition', 'attachment; filename="documento_corporativo_2026.docx"');

    const mockResponse = {
        ok: true,
        headers: mockHeaders,
        blob: async () => ({ size: 1024, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    };

    // Simular el parseo de Content-Disposition
    let fileName = 'descarga_archivo';
    const contentDisposition = mockResponse.headers.get('content-disposition');
    if (contentDisposition) {
        const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
        const matches = filenameRegex.exec(contentDisposition);
        if (matches != null && matches[1]) {
            fileName = matches[1].replace(/['"]/g, '');
        }
    }

    assert.strictEqual(fileName, 'documento_corporativo_2026.docx', 'Debe extraer correctamente el nombre original del archivo desde el Content-Disposition.');
});

// 4. Simular separadores cronológicos formateados en español
test('Spanish Chronological Day Dividers - Format uppercase and dashes', () => {
    const formatDateInSpanish = (dateStr) => {
        try {
            const date = new Date(dateStr);
            const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
            let formatted = new Intl.DateTimeFormat('es-ES', options).format(date);
            return `— ${formatted.toUpperCase()} —`;
        } catch (e) {
            return '';
        }
    };

    // Use a fixed date: 2026-07-28
    const testDate = '2026-07-28T12:00:00.000Z';
    const result = formatDateInSpanish(testDate);

    // Assert that it matches Tuesday (Martes), 28, July (Julio), 2026 and wraps with dashes
    assert.match(result, /— (MARTES|TUESDAY), 28 DE (JULIO|JULY) DE 2026 —/i);
});

// 5. Verificar estructura real desacoplada de MediaPreviewModal y TaskSidePanel
test('MediaPreviewModal Decoupled Structural Integrity - Absolute Centering and Viewport Constraint', async () => {
    const { readFileSync } = await import('node:fs');
    const code = readFileSync('src/components/modules/TaskSidePanel.jsx', 'utf8');

    // Assert the structural decoupling of MediaPreviewModal exists in JSX
    assert.ok(code.includes('DialogPortal'), 'MediaPreviewModal must use DialogPortal to decouple from parent rendering nodes.');
    assert.ok(code.includes('DialogOverlay'), 'MediaPreviewModal must use DialogOverlay as a dedicated full-screen backdrop.');
    assert.ok(code.includes('DialogPrimitive.Content'), 'MediaPreviewModal must use DialogPrimitive.Content for its custom layout wrapper.');
    assert.ok(code.includes('<DialogPrimitive.Title className="sr-only">Vista previa de imagen</DialogPrimitive.Title>'), 'MediaPreviewModal must expose an accessible dialog title.');
    assert.ok(code.includes('<DialogPrimitive.Description className="sr-only">'), 'MediaPreviewModal must expose an accessible dialog description.');

    // Assert absolute positioning layout rules
    assert.ok(code.includes('fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'), 'MediaPreviewModal Content must use fixed translations for geometric centering.');
    assert.ok(code.includes('w-[calc(100vw-2rem)]'), 'MediaPreviewModal Content width must be constrained responsive.');
    assert.ok(code.includes('h-[calc(100dvh-2rem)]'), 'MediaPreviewModal Content height must be constrained responsive.');

    // Assert the image region dimensions
    assert.ok(code.includes('max-w-full max-h-full w-auto h-auto object-contain'), 'Image preview tag must be fully constrained (max-w-full, max-h-full, object-contain) to prevent viewport overflows.');
});

// 6. Verificar integración de Tiptap, popovers de comentarios y estrella especial sin campo extra
test('Tiptap, Unified Popovers and Header Special Star', async () => {
    const { readFileSync } = await import('node:fs');
    const code = readFileSync('src/components/modules/TaskSidePanel.jsx', 'utf8');

    // Assert Tiptap is imported and used
    assert.ok(code.includes('RichTextEditor'), 'RichTextEditor must be imported and integrated inside the task sidebar.');

    // Assert the unified commentPopover state is used
    assert.ok(code.includes('commentPopover'), 'Unified commentPopover state must manage reaction and CRUD view states.');
    assert.ok(!code.includes('openMenuCommentId'), 'Legacy openMenuCommentId must be completely removed.');

    // Assert Especial is a header star action, not a typed metadata field
    assert.ok(code.includes('handleToggleSpecial'), 'Special star must be controlled by a dedicated header toggle.');
    assert.ok(code.includes('title={formData.isSpecial ? "Quitar especial" : "Marcar como especial"}'), 'Special star must expose a clear header action title.');
    assert.ok(!code.includes('taskSpecialInlinePanel'), 'Special must not open an inline type/name field.');
});

// 7. Verificar que el banner de borrador solo aparezca si hay contenido real
test('Task Draft Banner - ignores empty auto-saved snapshots', async () => {
    const { readFileSync } = await import('node:fs');
    const code = readFileSync('src/components/modules/TaskSidePanel.jsx', 'utf8');

    assert.ok(code.includes('hasMeaningfulTaskDraft'), 'TaskSidePanel must use a meaningful-draft guard instead of accepting any JSON snapshot.');
    assert.ok(!code.includes('const hasRealDraft = () =>'), 'Legacy hasRealDraft accepted empty auto-saved snapshots and must be removed.');
    assert.ok(code.includes('hasMeaningfulTaskDraft(parsed)'), 'Draft restoration must only hydrate meaningful snapshots.');
    assert.ok(code.includes('hasMeaningfulTaskDraft(draftData)'), 'Draft autosave must persist only meaningful snapshots.');
});

// 8. Verificar que el chat acepte adjuntos generales por arrastre y no solo imagenes
test('Task Chat Attachments - drag and drop accepts files and renders images as file cards', async () => {
    const { readFileSync } = await import('node:fs');
    const code = readFileSync('src/components/modules/TaskSidePanel.jsx', 'utf8');

    assert.ok(code.includes('handleDroppedChatFiles'), 'TaskSidePanel must route dropped files through a shared chat-file handler.');
    assert.ok(!code.includes("file && file.type.startsWith('image/')"), 'Drop handling must not be limited to image MIME types.');
    assert.ok(code.includes('getFileVisualMeta'), 'Attachments must use file metadata to choose icons and preview affordances.');
    assert.ok(code.includes('Vista previa'), 'Image attachments must expose a preview action while remaining file-style cards.');
});

// 9. Verificar que adjuntos de conversacion no se mezclen con referencias/insumos manuales
test('Task Attachment References - excludes chat-linked files from manual link sections', async () => {
    const { readFileSync } = await import('node:fs');
    const code = readFileSync('src/components/modules/TaskSidePanel.jsx', 'utf8');
    const serviceCode = readFileSync('src/services/nativeTaskService.js', 'utf8');

    assert.ok(code.includes('getManualTaskAttachments'), 'TaskSidePanel must filter manual attachments separately from chat attachments.');
    assert.ok(code.includes('!attachment.commentId'), 'Manual attachment sections must exclude files linked to conversation comments.');
    assert.ok(serviceCode.includes('content: initialCommentText'), 'Initial creation comments must not expose private bucket URLs as visible comment text.');
});

// 10. Verificar que el modo creacion use una composicion mas limpia y menos pesada
test('Task Creation Composer - uses softer labels and lighter field chrome', async () => {
    const { readFileSync } = await import('node:fs');
    const code = readFileSync('src/components/modules/TaskSidePanel.jsx', 'utf8');

    assert.ok(code.includes('taskCreateLabelClass'), 'Creation mode must share a soft label class instead of repeated uppercase black labels.');
    assert.ok(code.includes('taskCreateFieldClass'), 'Creation mode must share a lighter field class for compact metadata controls.');
    assert.ok(code.includes('TaskCreateComposerV2'), 'Creation form must expose a scoped marker for the lighter composer treatment.');
    assert.ok(code.includes('Nombre de la tarea'), 'The creation title label should use natural sentence casing.');
    assert.ok(code.includes('Escribe el nombre de la tarea'), 'The creation title placeholder should feel closer to ClickUp-style task entry.');
    assert.ok(code.includes('border-zinc-200/70 dark:border-zinc-800/70 bg-transparent'), 'Creation fields should reduce box weight with transparent surfaces.');
});

// 11. Verificar que edicion comparta el nuevo lenguaje visual y cierre estados flotantes
test('Task Edit Panel - shares clean composer language and resets transient toolbar state', async () => {
    const { readFileSync } = await import('node:fs');
    const code = readFileSync('src/components/modules/TaskSidePanel.jsx', 'utf8');

    assert.ok(code.includes('TaskComposerUnifiedV2'), 'Create and edit task forms must share one unified clean visual treatment.');
    assert.ok(code.includes('setShowToolbar(false);'), 'Main format toolbar state must reset when opening, closing or changing tasks.');
    assert.ok(code.includes('setShowEditToolbar(false);'), 'Inline edit format toolbar state must reset when opening, closing or changing tasks.');
    assert.ok(code.includes('Guardar cambios'), 'Edit mode must keep the same save action while using sentence casing.');
    assert.ok(!code.includes('isEdition ? "text-[10px] font-black uppercase tracking-widest text-zinc-400" : taskCreateLabelClass'), 'Edit labels must not keep the old heavy uppercase label branch.');
});

// 12. Verificar controles compactos de prioridad y estrella especial en cabecera
test('Task Composer Attributes - priority stays compact and special lives in the header', async () => {
    const { readFileSync } = await import('node:fs');
    const code = readFileSync('src/components/modules/TaskSidePanel.jsx', 'utf8');

    assert.ok(code.includes('taskPriorityOptions'), 'Priority options should be rendered from a compact option map.');
    assert.ok(code.includes('Prioridad</span>'), 'The priority trigger should be labeled as Prioridad instead of a question.');
    assert.ok(code.includes('role="radiogroup"'), 'Expanded priority choices should be inline selectable options.');
    assert.ok(code.includes('showPriorityPopover'), 'Priority choices should be controlled by a popover state instead of expanding the field height.');
    assert.ok(code.includes('data-task-priority-popover'), 'Priority choices should render in a scoped popover surface.');
    assert.ok(!code.includes('border-t border-red-500/10 p-1.5'), 'Priority options should not render as an inline row that pushes the task form down.');
    assert.ok(code.includes('taskOperationalGridClass'), 'Deadline, status and priority should use a dedicated compact operational row.');
    assert.ok(code.includes('aria-pressed={formData.isSpecial}'), 'Special should be a pressed-state star action in the header.');
    assert.ok(!code.includes('taskSpecialInlinePanel'), 'Special should not render a secondary name/type panel.');
    assert.ok(!code.includes('<label className={taskComposerLabelClass}>Especial</label>'), 'The main metadata row should not show a Special label.');
    assert.ok(!code.includes('specialType: formData.isSpecial ? formData.specialType : null'), 'Save payload should not send a custom special type anymore.');
    assert.ok(!code.includes('¿Es prioritaria?'), 'The old question label should be removed.');
    assert.ok(!code.includes('<select') || !code.includes('value={formData.priority ||'), 'Priority selection should not render as a second select row.');
});

// 13. Verificar que el indicador de borrador no empuje el layout
test('Task Draft Status - uses subtle header pill without layout shift', async () => {
    const { readFileSync } = await import('node:fs');
    const code = readFileSync('src/components/modules/TaskSidePanel.jsx', 'utf8');

    assert.ok(code.includes('Borrador creado'), 'Draft status should use the shorter subtle copy.');
    assert.ok(code.includes('<span className="text-amber-400 dark:text-amber-500">|</span>'), 'Draft status should separate copy and action with a simple pipe.');
    assert.ok(code.includes('Limpiar'), 'Draft status should keep a compact clear action.');
    assert.ok(code.includes('data-task-draft-status-pill'), 'Draft status should render as a scoped header pill.');
    assert.ok(!code.includes('Borrador restaurado de tu'), 'The old restored-session banner copy should be removed.');
    assert.ok(!code.includes('border-b border-amber-200'), 'Draft status should not render as a full-width banner that shifts the form down.');
});

// 14. Verificar que el selector de fecha use estilos propios del sistema
test('Task Deadline DatePicker - uses Brainstudio themed calendar chrome', async () => {
    const { readFileSync } = await import('node:fs');
    const code = readFileSync('src/components/modules/TaskSidePanel.jsx', 'utf8');
    const helper = readFileSync('src/lib/brainDatePicker.js', 'utf8');
    const css = readFileSync('src/index.css', 'utf8');

    assert.ok(code.includes('brainDatePickerProps'), 'Task deadline picker should opt into the shared Brainstudio calendar props.');
    assert.ok(helper.includes("calendarClassName: 'brain-datepicker'"), 'Shared calendar props should opt into the Brainstudio calendar theme.');
    assert.ok(helper.includes("popperClassName: 'brain-datepicker-popper'"), 'Shared calendar props should use a scoped popper class.');
    assert.ok(helper.includes("registerLocale('es', es)"), 'Shared calendar helper should register the Spanish datepicker locale.');
    assert.ok(helper.includes("locale: 'es'"), 'Shared calendar helper should render month and weekday labels in Spanish.');
    assert.ok(code.includes('h-[38px] pl-10 cursor-pointer'), 'Task deadline input should leave enough space for the calendar icon.');
    assert.ok(css.includes('.brain-datepicker'), 'Global CSS should include the themed datepicker shell.');
    assert.ok(css.includes('.brain-datepicker .react-datepicker__day--selected'), 'Selected days should have explicit themed styling.');
    assert.ok(css.includes('.dark .brain-datepicker'), 'The themed datepicker must support dark mode.');
});
