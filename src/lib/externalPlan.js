// Lectura de las parrillas de MIO (Rodny, 29 de octubre de 2026: «MIO pide parrillas en Excel solamente … habría que
// tener una especie de lectura de las parrillas en Excel de cada cliente de MIO»). Cada cliente de MIO tiene su parrilla
// en una hoja de Google, una pestaña por mes («OCTUBRE», «NOVIEMBRE»), con columnas como Formato, Fecha y ESTADO en el
// orden que cada una quiera. La plataforma la lee y, con la cuenta de servicio, escribe solo dos cosas: el estado de una
// pieza y la respuesta a un comentario de Google.
//
// - El mes de una pieza lo dice el nombre de la pestaña, no su fecha: las fechas traen errores de digitación.
// - El estado de la hoja se traduce a las etapas de la plataforma, para que el avance y el semáforo cuenten igual que
//   con una parrilla hecha aquí.
// Regla pura; quien descarga la hoja es `externalPlanService.js`.

/** Tope de cada texto que se guarda de una pieza: el guion entero cabe, una hoja rota no llena la base. */
const MAX_TEXT = 4000;

export const MONTH_TABS = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
export const EXTERNAL_STAGES = ['creada', 'redactada', 'disenada', 'aprobada', 'programada', 'publicada'];

const fold = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

/** El identificador de una hoja de Google, o null si el enlace no es de una. Solo se acepta docs.google.com. */
export const sheetIdFromUrl = (url) => {
    let parsed;
    try { parsed = new URL(String(url ?? '').trim()); } catch { return null; }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'docs.google.com') return null;
    const match = parsed.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})(\/|$)/);
    return match ? match[1] : null;
};

/** Las pestañas de la hoja, leídas de su vista pública: `[{ name, gid }]`. */
export const parseSheetTabs = (html) => {
    const tabs = [];
    const pattern = /name: "((?:[^"\\]|\\.)*)", pageUrl: "[^"]*?gid(?:=|\\x3d)(\d+)/g;
    let match;
    while ((match = pattern.exec(String(html ?? '')))) {
        const name = match[1].replace(/\\(.)/g, '$1');
        if (!tabs.some((tab) => tab.gid === match[2])) tabs.push({ name, gid: match[2] });
    }
    return tabs;
};

/**
 * La pestaña de un mes: la que se llama como el mes (con o sin año, con o sin espacios). Las copias («Copia de OCTUBRE»)
 * no cuentan. Si hay varias, gana la que dice el año.
 */
export const monthTab = (tabs, year, month) => {
    const name = MONTH_TABS[month - 1];
    const candidates = (tabs || []).filter((tab) => {
        // «JULIO 2026.» es julio: los signos sueltos no cambian el mes. «MAYO-JUNIO» no es ninguno de los dos.
        const folded = fold(tab.name).replace(/[^A-Z0-9 -]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (folded.startsWith('COPIA')) return false;
        return folded === name || folded === `${name} ${year}` || folded === `${name} DE ${year}`;
    });
    return candidates.find((tab) => fold(tab.name).includes(String(year))) || candidates[0] || null;
};

/** Qué etapa dice el ESTADO de la hoja. Si trae dos («PUBLICADO PROGRAMADO»), cuenta la más avanzada. */
export const stageFromStatus = (status) => {
    const text = fold(status);
    if (!text) return 'creada';
    if (text.includes('PUBLICAD')) return 'publicada';
    if (text.includes('PROGRAMAD')) return 'programada';
    if (text.includes('APROBAD')) return 'aprobada';
    // En revisión del cliente o en ajustes: la pieza ya está diseñada y espera su aprobación.
    if (text.includes('REVISION') || text.includes('AJUSTE') || text.includes('DISENAD') || text.includes('DISENO LISTO') || text.includes('REALIZAD') || text.includes('DEVUELT') || text.includes('ENVIADO')) return 'disenada';
    if (text.includes('DISENO') || text.includes('REDACTAD') || text.includes('SOLICITUD') || text.includes('PROCESO') || text.includes('PRODUCCION')) return 'redactada';
    return 'creada';
};

/**
 * El estado de la plataforma que corresponde al de la hoja, para que la pieza se nombre igual sea de MIO o no
 * (Rodny, 29 de octubre de 2026: «ese es el nombre que usamos en la plataforma»). La etapa la sigue diciendo
 * `stageFromStatus`; esto es solo el nombre que se muestra.
 */
export const platformStatusFromSheet = (status) => {
    const text = fold(status);
    if (!text) return 'BORRADOR';
    if (text.includes('PUBLICAD')) return 'PUBLICADO';
    if (text.includes('PROGRAMAD')) return 'PROGRAMADO';
    if (text.includes('APROBAD')) return 'APROBADO';
    if (text.includes('REALIZAD') || text.includes('DISENAD') || text.includes('DISENO LISTO')) return 'REALIZADO';
    if (text.includes('DEVUELT') || text.includes('AJUSTE')) return 'DEVUELTO';
    // «Enviado al cliente» (Mari Colón) es la pieza en manos del cliente para aprobarla.
    if (text.includes('REVISION') || text.includes('ENVIADO')) return 'EN_REVISION';
    if (text.includes('DISENO') || text.includes('PROCESO') || text.includes('PRODUCCION') || text.includes('REDACTAD') || text.includes('SOLICITUD')) return 'EN_PRODUCCION';
    return 'BORRADOR';
};

/** El formato de la pieza en las palabras de la parrilla de la plataforma. */
export const formatFromText = (value) => {
    const text = fold(value);
    if (text.startsWith('REEL') || text.includes('VIDEO')) return 'Reel';
    if (text.startsWith('CARRUSEL')) return 'Carrusel';
    if (text.startsWith('POST') || text.includes('PIEZA') || text.includes('FOTO')) return 'Post';
    return 'Otro';
};

const pad = (n) => String(n).padStart(2, '0');

/** «19/10/2026», «19/10/26» o «19/10» → «2026-10-19» si cae en el mes de la pestaña; si no, null. */
export const pieceDate = (value, year, month) => {
    const match = String(value ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if (!match) return null;
    const day = Number(match[1]);
    const m = Number(match[2]);
    const y = match[3] ? (match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3])) : year;
    if (m !== month || y !== year || day < 1 || day > 31) return null;
    const key = `${y}-${pad(m)}-${pad(day)}`;
    return new Date(`${key}T12:00:00Z`).toISOString().slice(0, 10) === key ? key : null;
};

/**
 * Las piezas de una pestaña. Busca la fila de encabezados (la que tiene «Formato» y «Estado») y toma cada fila con
 * formato debajo. Devuelve `{ pieces, problem }`.
 */
export const parsePlanRows = (rows, { year, month }) => {
    const headerIndex = (rows || []).findIndex((row) => {
        const cells = row.map(fold);
        return cells.includes('FORMATO') && cells.some((cell) => cell.startsWith('ESTADO'));
    });
    if (headerIndex < 0) return { pieces: [], problem: 'La pestaña no tiene las columnas Formato y Estado.' };
    const header = rows[headerIndex].map(fold);
    const column = (test) => header.findIndex(test);
    const formatAt = column((cell) => cell === 'FORMATO');
    const statusAt = column((cell) => cell.startsWith('ESTADO'));
    const dateAt = column((cell) => cell.startsWith('FECHA'));
    const numberAt = column((cell) => cell.startsWith('N°') || cell.startsWith('NO ') || cell.startsWith('N '));
    const objectiveAt = column((cell) => cell.startsWith('OBJETIVO'));
    const copyAt = column((cell) => cell.startsWith('COPY') || cell.startsWith('TEXTO'));
    const captionAt = column((cell) => cell.startsWith('CAPTION'));
    const contentAt = column((cell) => cell.startsWith('CONTENIDO') || cell.startsWith('MATERIAL'));
    const commentAt = column((cell) => cell.startsWith('COMENTARIO'));
    const text = (row, at) => (at >= 0 ? String(row[at] ?? '').trim().slice(0, MAX_TEXT) || null : null);
    // Las plantillas traen filas con el formato, el número, el objetivo y las redes ya puestos y nada más: esas todavía
    // no son piezas. Una pieza tiene algo propio —fecha, estado, texto o enlace—.
    const filler = new Set([formatAt, numberAt, objectiveAt, column((cell) => cell.startsWith('REDES'))]);
    const pieces = [];
    let blank = 0;
    for (const [offset, row] of rows.slice(headerIndex + 1).entries()) {
        // Dos filas vacías seguidas cierran la parrilla: lo de abajo es otra tabla (Mari Colón pone ahí las
        // «PRIORIDADES DEL CLIENTE», numeradas en la columna del formato) y no son piezas.
        if (!row.some((cell) => String(cell ?? '').trim())) {
            blank += 1;
            if (blank >= 2 && pieces.length) break;
            continue;
        }
        blank = 0;
        const format = String(row[formatAt] ?? '').trim();
        if (!format) continue;
        if (!row.some((cell, index) => !filler.has(index) && String(cell ?? '').trim())) continue;
        pieces.push({
            // La fila de la hoja (1 es la primera): con ella «Abrir en la hoja» llega a la pieza.
            row: headerIndex + 2 + offset,
            number: numberAt >= 0 ? String(row[numberAt] ?? '').trim() || null : null,
            format: formatFromText(format),
            formatText: format.slice(0, 80),
            date: dateAt >= 0 ? pieceDate(row[dateAt], year, month) : null,
            dateText: text(row, dateAt),
            status: String(row[statusAt] ?? '').replace(/\s+/g, ' ').trim() || null,
            stage: stageFromStatus(row[statusAt]),
            objective: text(row, objectiveAt),
            copy: text(row, copyAt),
            caption: text(row, captionAt),
            content: text(row, contentAt),
            comment: text(row, commentAt)
        });
    }
    // Dónde está cada cosa en la pestaña: con esto la plataforma escribe el estado en la celda correcta.
    const layout = { headerRow: headerIndex + 1, statusColumn: statusAt, numberColumn: numberAt, formatColumn: formatAt };
    return { pieces, layout, problem: pieces.length ? null : 'La pestaña del mes no tiene piezas todavía.' };
};

/** La letra de una columna: 0 → A, 26 → AA. */
export const columnLetter = (index) => {
    let n = Number(index) + 1;
    let letters = '';
    while (n > 0) {
        const rest = (n - 1) % 26;
        letters = String.fromCharCode(65 + rest) + letters;
        n = Math.floor((n - 1) / 26);
    }
    return letters;
};

/**
 * Los estados que se ofrecen cuando la columna ESTADO de la hoja no tiene desplegable (Casa Bella la escribe a mano): los
 * que ya usan las hojas de MIO, en el orden del trabajo.
 */
export const DEFAULT_SHEET_STATUSES = ['SIN REALIZAR', 'EN PRODUCCIÓN', 'EN REVISIÓN', 'EN AJUSTE', 'REALIZADO', 'APROBADO', 'PROGRAMADO', 'PUBLICADO'];

/** Las opciones de los desplegables de una columna, sin repetir y en el orden de la hoja. */
export const validationOptions = (rules = []) => {
    const seen = new Set();
    const options = [];
    for (const rule of rules) {
        if (!['ONE_OF_LIST'].includes(rule?.condition?.type)) continue;
        for (const value of rule.condition.values || []) {
            const option = String(value?.userEnteredValue ?? '').trim();
            if (option && !seen.has(fold(option))) {
                seen.add(fold(option));
                options.push(option);
            }
        }
    }
    return options;
};

/**
 * Antes de escribir, la fila de la hoja tiene que seguir siendo la misma pieza: mismo número y mismo formato. Si MIO movió
 * o insertó filas desde la última lectura, no se escribe. Devuelve el motivo, o null si se puede.
 */
export const rowIdentityProblem = (rowValues = [], piece, layout) => {
    const cell = (index) => (index >= 0 ? String(rowValues[index] ?? '').trim() : '');
    const number = cell(layout?.numberColumn);
    const format = cell(layout?.formatColumn);
    if ((piece.number || '') !== number || fold(piece.formatText || '') !== fold(format)) {
        return `La hoja cambió: la fila ${piece.row} ya no es ${pieceLabel(piece)}. Lee la hoja de nuevo antes de cambiarla.`;
    }
    return null;
};

/** Si el estado que hay ahora en la hoja es el que vio la persona (sin mirar tildes ni mayúsculas). */
export const sameStatus = (a, b) => fold(a || '') === fold(b || '');

/**
 * Un cliente con hoja de MIO no lleva parrillas nativas (Rodny, 29 de octubre de 2026: «quedémonos solamente con las
 * hojas de excel para las parrillas de MIO, no parrillas nativas»): su parrilla vive en la hoja y se ve en Parrillas.
 * Devuelve el motivo para no crear una, o null.
 */
export const nativePlanProblem = (client) => (client?.externalPlanUrl
    ? `Las parrillas de ${client.name || 'este cliente'} viven en su hoja de MIO y se ven en Parrillas: no se crean aquí.`
    : null);

/** Lo que dice la plataforma al responder un comentario de Google: con el nombre de quien lo escribe. */
export const replyContent = (authorName, text) => `${authorName} (Brain Studio): ${String(text || '').trim()}`;

/** Cuántas piezas llegaron al menos a cada etapa, como la parrilla de la plataforma. */
export const summarizeExternalPieces = (pieces = []) => {
    const rank = (stage) => EXTERNAL_STAGES.indexOf(stage);
    return {
        created: pieces.length,
        reached: Object.fromEntries(EXTERNAL_STAGES.slice(1).map((stage) => [stage, pieces.filter((piece) => rank(piece.stage) >= rank(stage)).length]))
    };
};

/**
 * Una pieza de la hoja con la forma que leen las reglas de Operación (`pieceStage`, `summarizeCycle`), para que el
 * avance y el semáforo se calculen exactamente igual que con una parrilla hecha en la plataforma.
 */
export const asOperationPiece = (piece, index) => {
    const rank = EXTERNAL_STAGES.indexOf(piece.stage);
    const status = platformStatusFromSheet(piece.status);
    return {
        id: `externa-${index + 1}`,
        planId: null,
        external: true,
        status,
        date: piece.date,
        format: piece.format,
        title: `${piece.format}${piece.number ? ` ${piece.number}` : ''} · ${piece.status || 'sin estado'}`,
        copyText: rank >= 1 ? 'en la hoja de MIO' : '',
        captionText: '',
        hasFinalAsset: rank >= 2,
        hasActivePublication: rank >= 4,
        markedByHand: false
    };
};

// El espejo en Parrillas (Rodny, 29 de octubre de 2026: «desde la plataforma misma podamos ver si hay comentarios nuevos
// del cliente, correcciones, aprobaciones»). Lo que sigue compara una lectura con la anterior y junta los comentarios de
// Google de la hoja con sus piezas.

/** El enlace que abre la hoja en la fila de una pieza. */
export const sheetCellUrl = (url, gid, row) => {
    const id = sheetIdFromUrl(url);
    if (!id) return null;
    const anchor = gid != null ? `#gid=${gid}${row ? `&range=A${row}` : ''}` : '';
    return `https://docs.google.com/spreadsheets/d/${id}/edit${anchor}`;
};

/** Cómo se nombra una pieza en un aviso: «Reel 5». */
export const pieceLabel = (piece) => `${piece?.format || 'Pieza'}${piece?.number ? ` ${piece.number}` : piece?.row ? ` (fila ${piece.row})` : ''}`;

const pieceKey = (piece) => (piece?.number ? `n:${piece.number}` : `r:${piece?.row}`);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodeEntities = (value) => String(value ?? '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);

const loose = (value) => decodeEntities(value).toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * La pieza a la que se refiere un comentario de Google. Google no dice en qué celda está (su ancla es un número interno),
 * así que se busca el texto que citó el comentario en el copy, el caption o el objetivo de cada pieza. Si no aparece, o
 * aparece en más de una, el comentario queda suelto: nunca se adivina.
 */
export const matchCommentToPiece = (quoted, pieces = []) => {
    const needle = loose(quoted).slice(0, 60);
    if (needle.length < 6) return null;
    const found = pieces.filter((piece) => [piece.copy, piece.caption, piece.objective, piece.comment, piece.content]
        .some((field) => field && loose(field).includes(needle)));
    return found.length === 1 ? found[0].row : null;
};

const TEXT_LIMIT = 1500;
const clip = (value) => String(value ?? '').trim().slice(0, TEXT_LIMIT);

/** Los comentarios de Google tal como los da la API de Drive, en la forma que guarda la plataforma. */
export const normalizeSheetComments = (raw = []) => raw
    .filter((comment) => comment && !comment.deleted)
    .map((comment) => ({
        id: String(comment.id),
        author: comment.author?.displayName || 'Alguien',
        mine: Boolean(comment.author?.me),
        content: clip(comment.content),
        quoted: clip(decodeEntities(comment.quotedFileContent?.value)).slice(0, 300),
        createdAt: comment.createdTime || null,
        modifiedAt: comment.modifiedTime || comment.createdTime || null,
        resolved: Boolean(comment.resolved),
        replies: (comment.replies || []).filter((reply) => !reply.deleted).map((reply) => ({
            id: String(reply.id || ''),
            author: reply.author?.displayName || 'Alguien',
            mine: Boolean(reply.author?.me),
            content: clip(reply.content) || (reply.action === 'resolve' ? 'Marcó el comentario como resuelto.' : reply.action === 'reopen' ? 'Reabrió el comentario.' : ''),
            createdAt: reply.createdTime || null
        }))
    }));

/**
 * Los comentarios que van con un mes: los que se refieren a una de sus piezas y, si `looseSince` llega, los que no se
 * pudieron atar a ninguna pieza, siguen abiertos y se movieron después de esa fecha (para el mes en curso).
 */
export const commentsForMonth = (comments = [], pieces = [], { looseSince = null, claimed = new Set() } = {}) => comments
    .map((comment) => ({ ...comment, row: matchCommentToPiece(comment.quoted, pieces) }))
    // Un comentario que ya es de una pieza de otro mes no se repite suelto en este.
    .filter((comment) => comment.row != null || (looseSince && !claimed.has(comment.id) && !comment.resolved && String(comment.modifiedAt || '') >= looseSince))
    .sort((a, b) => String(b.modifiedAt || '').localeCompare(String(a.modifiedAt || '')));

/**
 * Lo que cambió entre dos lecturas del mismo mes: estados, comentarios escritos en la hoja y comentarios o respuestas de
 * Google que no hizo la plataforma. Las piezas se reconocen por su número (o su fila si no tienen), no por su posición.
 */
export const diffExternalPlan = (previous, next) => {
    const events = [];
    const before = new Map((previous?.pieces || []).map((piece) => [pieceKey(piece), piece]));
    for (const piece of next?.pieces || []) {
        const old = before.get(pieceKey(piece));
        if (!old) continue;
        if ((old.status || '') !== (piece.status || '')) {
            events.push({ kind: 'STATUS', key: pieceKey(piece), row: piece.row, label: pieceLabel(piece), from: old.status || null, to: piece.status || null });
        }
        if (piece.comment && piece.comment !== old.comment) {
            events.push({ kind: 'SHEET_COMMENT', key: pieceKey(piece), row: piece.row, label: pieceLabel(piece), text: piece.comment.slice(0, 300) });
        }
    }
    const rowLabel = new Map((next?.pieces || []).map((piece) => [piece.row, pieceLabel(piece)]));
    const seen = new Map((previous?.comments || []).map((comment) => [comment.id, comment]));
    for (const comment of next?.comments || []) {
        const old = seen.get(comment.id);
        const label = comment.row != null ? rowLabel.get(comment.row) || null : null;
        if (!old) {
            if (!comment.mine && !comment.resolved) events.push({ kind: 'GOOGLE_COMMENT', row: comment.row ?? null, label, author: comment.author, text: comment.content.slice(0, 300), commentId: comment.id });
            continue;
        }
        const known = new Set((old.replies || []).map((reply) => reply.id || `${reply.createdAt}|${reply.content}`));
        for (const reply of comment.replies || []) {
            if (reply.mine || known.has(reply.id || `${reply.createdAt}|${reply.content}`)) continue;
            events.push({ kind: 'GOOGLE_REPLY', row: comment.row ?? null, label, author: reply.author, text: reply.content.slice(0, 300), commentId: comment.id });
        }
    }
    return events;
};

/** Un cambio en una línea, para el aviso y para la pantalla. */
export const changeLine = (event) => {
    const where = event.label ? ` en ${event.label}` : '';
    if (event.kind === 'STATUS') return `${event.label}: ${event.from || 'sin estado'} → ${event.to || 'sin estado'}`;
    if (event.kind === 'SHEET_COMMENT') return `${event.label}: comentario nuevo en la hoja — «${event.text}»`;
    if (event.kind === 'GOOGLE_COMMENT') return `${event.author} comentó${where}: «${event.text}»`;
    if (event.kind === 'GOOGLE_REPLY') return `${event.author} respondió${where}: «${event.text}»`;
    return '';
};

/** El aviso de la campana: corto, con el primer cambio y cuántos más hay. */
export const changesNoticeText = (clientName, monthLabel, events = []) => {
    if (!events.length) return null;
    const first = changeLine(events[0]);
    const head = `${clientName} · ${monthLabel.toLowerCase()}: `;
    const short = first.length > 140 ? `${first.slice(0, 137)}…` : first;
    return events.length === 1 ? `${head}${short}` : `${head}${short} (y ${events.length - 1} ${events.length === 2 ? 'cambio más' : 'cambios más'})`;
};
