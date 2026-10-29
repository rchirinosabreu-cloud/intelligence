// Lectura de las parrillas de MIO (Rodny, 29 de octubre de 2026: «MIO pide parrillas en Excel solamente … habría que
// tener una especie de lectura de las parrillas en Excel de cada cliente de MIO»). Cada cliente de MIO tiene su parrilla
// en una hoja de Google, una pestaña por mes («OCTUBRE», «NOVIEMBRE»), con columnas como Formato, Fecha y ESTADO en el
// orden que cada una quiera. La plataforma solo la lee: nunca escribe en la hoja.
//
// - El mes de una pieza lo dice el nombre de la pestaña, no su fecha: las fechas traen errores de digitación.
// - El estado de la hoja se traduce a las etapas de la plataforma, para que el avance y el semáforo cuenten igual que
//   con una parrilla hecha aquí.
// Regla pura; quien descarga la hoja es `externalPlanService.js`.

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
    // Las plantillas traen filas con el formato, el número, el objetivo y las redes ya puestos y nada más: esas todavía
    // no son piezas. Una pieza tiene algo propio —fecha, estado, texto o enlace—.
    const filler = new Set([formatAt, numberAt, column((cell) => cell.startsWith('OBJETIVO')), column((cell) => cell.startsWith('REDES'))]);
    const pieces = [];
    let blank = 0;
    for (const row of rows.slice(headerIndex + 1)) {
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
            number: numberAt >= 0 ? String(row[numberAt] ?? '').trim() || null : null,
            format: formatFromText(format),
            date: dateAt >= 0 ? pieceDate(row[dateAt], year, month) : null,
            status: String(row[statusAt] ?? '').replace(/\s+/g, ' ').trim() || null,
            stage: stageFromStatus(row[statusAt])
        });
    }
    return { pieces, problem: pieces.length ? null : 'La pestaña del mes no tiene piezas todavía.' };
};

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
