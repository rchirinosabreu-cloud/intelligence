import { readFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import { amountInWords } from '../utils/amountInWords.js';
import { formatPartyDocument, formatPartyName } from '../lib/partyIdentity.js';
import { pathToFileURL } from 'node:url';
import {
    formatReceivableNumber, parseReceivableConcept, receivableIssuer, RECEIVABLE_ISSUER_DEFAULT_NAME,
    isReceivableConceptHtml, receivableDocumentFilename
} from '../lib/receivableDocument.js';
import {
    DEFAULT_RECEIVABLE_CURRENCY, formatReceivableMoney, normalizeReceivableCurrency, receivableAmountInWords
} from '../lib/receivableCurrency.js';
import { normalizeReceivableConcept } from './receivableDocumentService.js';
import { proposalRichTextBlocks } from './quotationProposalDetails.js';
import { FinancialDomainError } from './financialRecordService.js';

// La cuenta de cobro tal como la reciben los clientes hoy en Word: mismo orden, mismo
// texto y mismas mayúsculas que los documentos reales 0366 y 0389. La tipografía y el
// logo son los de la casa, como en las cotizaciones.

const PAGE = { width: 210, height: 297, left: 20, right: 20, top: 18, bottom: 18 };
const CONTENT_WIDTH = PAGE.width - PAGE.left - PAGE.right;
const COLORS = {
    ink: [24, 24, 27],
    muted: [82, 82, 91],
    border: [200, 200, 205],
    headRow: [235, 238, 240],
    white: [255, 255, 255]
};

let cachedFonts;
let cachedLogo;

const getFonts = () => (cachedFonts ||= {
    regular: readFileSync(new URL('../assets/fonts/WorkSans-Regular.ttf', import.meta.url)).toString('base64'),
    bold: readFileSync(new URL('../assets/fonts/WorkSans-Bold.ttf', import.meta.url)).toString('base64')
});

// El logo de los documentos es el horizontal, cerebro más «BRAIN STUDIO» (Rodny, 20 de
// octubre de 2026: «este es el logo de los documentos, estás poniendo un logo que no es»);
// el cerebro cuadrado suelto es el icono de la aplicación, no el de los papeles.
export const DOCUMENT_LOGO = { file: '../../public/brainstudio-logo-horizontal.png', width: 44, height: 44 * 153 / 426 };
const getLogo = () => (cachedLogo ||= `data:image/png;base64,${readFileSync(
    new URL(DOCUMENT_LOGO.file, import.meta.url)
).toString('base64')}`);

/** Dibuja el logo de la casa arriba a la derecha, con su proporción, como en los documentos de Word. */
export const drawDocumentLogo = (doc) => {
    doc.addImage(getLogo(), 'PNG', PAGE.width - PAGE.right - DOCUMENT_LOGO.width, PAGE.top - 4, DOCUMENT_LOGO.width, DOCUMENT_LOGO.height, undefined, 'FAST');
};

// La rúbrica escaneada de Francisco Villa, recortada y con el fondo transparente.
const DEFAULT_SIGNATURE = new URL('../assets/firma-francisco-villa.png', import.meta.url);
// Alto de la firma en el documento; el ancho sale de su propia proporción.
const SIGNATURE_HEIGHT_MM = 15;

/**
 * Qué firma lleva este documento. La rúbrica es de una persona concreta: si alguien
 * cambia quién cobra por entorno y no pone la suya, el documento sale **sin firmar**,
 * con el hueco en blanco, en vez de estampar la firma de otro en un cobro.
 */
export const receivableSignatureImage = (issuer, env = {}) => {
    if (env.RECEIVABLE_ISSUER_SIGNATURE_IMAGE) return pathToFileURL(env.RECEIVABLE_ISSUER_SIGNATURE_IMAGE);
    return issuer.name === RECEIVABLE_ISSUER_DEFAULT_NAME ? DEFAULT_SIGNATURE : null;
};

const signatureCache = new Map();
const readSignature = (source) => {
    const key = String(source);
    if (!signatureCache.has(key)) {
        try {
            signatureCache.set(key, `data:image/png;base64,${readFileSync(source).toString('base64')}`);
        } catch (error) {
            // Una firma que no está no puede impedir el cobro: queda el hueco para
            // firmar a mano, como antes de tenerla escaneada.
            console.error('[Cuenta de cobro] No se pudo leer la firma, el documento sale sin firmar:', error?.message || error);
            signatureCache.set(key, null);
        }
    }
    return signatureCache.get(key);
};

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const longDate = (value) => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));

/**
 * El concepto como bloques que el PDF sabe dibujar: `kind` (heading, paragraph o
 * bullet), su texto y sus tramos con negrita, cursiva y subrayado. El concepto con
 * formato se vuelve a limpiar aquí, aunque ya se limpió al guardarlo: el PDF no confía
 * en lo que haya en la base. El texto plano de antes da un tramo por bloque.
 */
export const receivableConceptBlocks = (concept) => {
    if (!isReceivableConceptHtml(concept)) {
        return parseReceivableConcept(concept).map((block) => ({ ...block, runs: [{ text: block.text }] }));
    }
    let clean;
    try {
        clean = normalizeReceivableConcept(concept);
    } catch {
        return [];
    }
    return proposalRichTextBlocks(clean).map((block) => {
        const runs = block.runs
            .map(({ text, bold, italic, underline }) => ({ text, ...(bold ? { bold } : {}), ...(italic ? { italic } : {}), ...(underline ? { underline } : {}) }));
        const textValue = runs.map((run) => run.text).join('').replace(/\s+/g, ' ').trim();
        if (block.heading) return { kind: 'heading', level: block.heading, text: textValue, runs };
        if (block.bullet) return { kind: 'bullet', ...(block.ordinal ? { ordinal: block.ordinal } : {}), ...(block.continuation ? { continuation: true } : {}), text: textValue, runs };
        return { kind: 'paragraph', text: textValue, runs };
    }).filter((block) => block.text);
};

/**
 * Lo que el documento dice, sin dibujar nada. Separado para poder comprobarlo contra
 * las cuentas de cobro reales sin abrir un PDF.
 */
export const buildReceivableDocumentModel = (receivable, env = {}) => {
    const issuer = receivableIssuer(env);
    const currency = normalizeReceivableCurrency(receivable.currency) || DEFAULT_RECEIVABLE_CURRENCY;
    const usd = currency === 'USD';
    // En pesos el documento vale lo que la obligación. En dólares la obligación guarda su
    // valor en pesos para la cartera, y el documento —que dice dólares— es la suma de sus
    // conceptos, en centavos para no arrastrar error de coma flotante.
    const itemCents = (receivable.items || []).reduce((sum, item) => sum + Math.round((Number(item.amount) || 0) * 100), 0);
    const total = usd ? itemCents / 100 : Number(receivable.amount) || 0;
    const format = (value) => (usd ? formatReceivableMoney(value, currency) : money.format(value));
    const items = (receivable.items || []).map((item) => ({
        description: item.description,
        amount: Number(item.amount) || 0,
        formatted: format(Number(item.amount) || 0)
    }));
    return {
        issuer,
        currency,
        place: `${issuer.city} ${longDate(receivable.issuedAt)}`,
        title: `Cuenta de cobro ${formatReceivableNumber(receivable.number)}`,
        debtorName: formatPartyName(receivable.client, receivable.client?.name),
        debtorDocument: formatPartyDocument(receivable.client),
        amountInWords: usd ? receivableAmountInWords(total, currency) : amountInWords(total),
        amountInFigures: `(${format(total)})`,
        concept: receivableConceptBlocks(receivable.concept),
        // Con un solo concepto el documento no lleva tabla, como el de Elvira Utria.
        items: items.length > 1 ? items : [],
        total,
        formattedTotal: format(total),
        servicePeriod: receivable.servicePeriod || null,
        // Pagar en dólares suele ser otra instrucción que consignar en pesos: si está
        // configurada se usa; si no, la de siempre.
        bankLine: usd && issuer.bankLineUsd ? issuer.bankLineUsd : issuer.bankLine,
        signatureImage: receivableSignatureImage(issuer, env)
    };
};

const setText = (doc, { size = 10.5, style = 'normal', color = COLORS.ink } = {}) => {
    doc.setFont('WorkSans', style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
};

const centered = (doc, text, y, options) => {
    setText(doc, options);
    doc.text(text, PAGE.width / 2, y, { align: 'center' });
    return y + (options?.size || 10.5) * 0.42 + 1.6;
};

const paragraph = (doc, text, y, { width = CONTENT_WIDTH, left = PAGE.left, ...options } = {}) => {
    setText(doc, options);
    const lines = doc.splitTextToSize(text, width);
    doc.text(lines, left, y, { align: 'justify', maxWidth: width });
    return y + lines.length * ((options.size || 10.5) * 0.42 + 1.1);
};

/**
 * La letra del concepto (Rodny, 30 de septiembre de 2026: «siento que es muy grande …
 * reducir un poquito el interletrado y el tamaño de letra … la viñeta es muy gigante»).
 * Un punto menos que el cuerpo del documento, interletrado apenas cerrado y la viñeta
 * dibujada como un punto pequeño en vez del carácter ● a tamaño de texto.
 * `charSpace` va en milímetros por letra; jsPDF no lo cuenta al medir, así que el
 * reparto en líneas lo suma a mano.
 */
export const CONCEPT_TYPOGRAPHY = {
    size: 9.5,
    charSpace: -0.06,
    lineGap: 0.95,
    headingSizes: { 1: 12, 2: 11, 3: 10.5 },
    bulletRadius: 0.5,
    indent: 6.5
};

// Un concepto largo con formato puede pasar de una página: se abre otra en vez de
// escribir por debajo del borde.
const ensureSpace = (doc, y, needed) => {
    if (y + needed <= PAGE.height - PAGE.bottom) return y;
    doc.addPage();
    return PAGE.top + 4;
};

// Work Sans solo trae normal y negrita; la cursiva usa la de Helvetica, como el PDF de
// las propuestas.
const setRunFont = (doc, { bold, italic }, size) => {
    doc.setFontSize(size);
    doc.setTextColor(...COLORS.ink);
    if (italic) doc.setFont('helvetica', bold ? 'bolditalic' : 'italic');
    else doc.setFont('WorkSans', bold ? 'bold' : 'normal');
};

/**
 * Un documento con las fuentes de la casa ya registradas. Lo usa el PDF y lo usan las
 * pruebas que miden el reparto en líneas con la misma letra.
 */
export const newReceivableDocument = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const fonts = getFonts();
    doc.addFileToVFS('WorkSans-Regular.ttf', fonts.regular);
    doc.addFont('WorkSans-Regular.ttf', 'WorkSans', 'normal');
    doc.addFileToVFS('WorkSans-Bold.ttf', fonts.bold);
    doc.addFont('WorkSans-Bold.ttf', 'WorkSans', 'bold');
    return doc;
};

// Ancho real de un texto con el interletrado: jsPDF no lo suma al medir.
const measure = (doc, text, charSpace) => doc.getTextWidth(text) + charSpace * text.length;

/**
 * Reparte los tramos de un bloque en líneas que caben en `width`. Cada palabra conserva
 * su estilo y si iba separada de la anterior por un espacio: «Este» en negrita pegado a
 * «:» sin negrita sigue siendo «Este:». Un salto de línea escrito fuerza línea nueva.
 */
export const layoutConceptLines = (doc, runs, { width, size, charSpace, heading = false }) => {
    setRunFont(doc, {}, size);
    const spaceWidth = measure(doc, ' ', charSpace);
    const lines = [];
    let line = { words: [], width: 0, hardBreak: false };
    let pendingSpace = false;
    const closeLine = (hardBreak) => {
        if (line.words.length) lines.push({ ...line, hardBreak });
        line = { words: [], width: 0, hardBreak: false };
    };
    const place = (word) => {
        const gap = line.words.length && word.space ? spaceWidth : 0;
        if (line.words.length && line.width + gap + word.width > width) {
            closeLine(false);
            line.words.push({ ...word, space: false });
            line.width = word.width;
            return;
        }
        line.words.push(line.words.length ? word : { ...word, space: false });
        line.width += gap + word.width;
    };
    for (const run of runs) {
        const style = { bold: Boolean(run.bold || heading), italic: Boolean(run.italic), underline: Boolean(run.underline) };
        setRunFont(doc, style, size);
        for (const token of run.text.split(/(\s+)/)) {
            if (!token) continue;
            if (!token.trim()) {
                if (token.includes('\n')) { closeLine(true); pendingSpace = false; } else pendingSpace = true;
                continue;
            }
            // Una palabra más ancha que la columna se parte en vez de salirse.
            let remaining = token;
            while (remaining) {
                let piece = remaining;
                while (piece.length > 1 && measure(doc, piece, charSpace) > width) piece = piece.slice(0, -1);
                place({ text: piece, ...style, width: measure(doc, piece, charSpace), space: pendingSpace });
                pendingSpace = false;
                remaining = remaining.slice(piece.length);
            }
        }
    }
    closeLine(true);
    return lines.map((item) => ({ ...item, spaceWidth }));
};

/**
 * Dibuja un bloque del concepto. Las líneas se justifican repartiendo el hueco entre
 * palabras —salvo la última de cada párrafo y los títulos—, así el texto con negritas
 * queda tan alineado como el que no las tiene. Devuelve la altura siguiente.
 */
const drawConceptBlock = (doc, runs, startY, { left, width, size, charSpace, lineGap = CONCEPT_TYPOGRAPHY.lineGap, heading = false }) => {
    const lineHeight = size * 0.42 + lineGap;
    let y = startY;
    const lines = layoutConceptLines(doc, runs, { width, size, charSpace, heading });
    for (const [index, line] of lines.entries()) {
        if (index > 0) y = ensureSpace(doc, y + lineHeight, lineHeight);
        const gaps = line.words.filter((word, position) => position > 0 && word.space).length;
        const justify = !heading && !line.hardBreak && index < lines.length - 1 && gaps > 0;
        const extra = justify ? (width - line.width) / gaps : 0;
        let x = left;
        line.words.forEach((word, position) => {
            if (position > 0 && word.space) {
                const gap = line.spaceWidth + extra;
                // Un subrayado de varias palabras es una sola raya, no una por palabra.
                if (word.underline && line.words[position - 1].underline) {
                    doc.setDrawColor(...COLORS.ink);
                    doc.setLineWidth(0.2);
                    doc.line(x, y + 0.8, x + gap, y + 0.8);
                }
                x += gap;
            }
            setRunFont(doc, word, size);
            doc.text(word.text, x, y, { charSpace });
            if (word.underline) {
                doc.setDrawColor(...COLORS.ink);
                doc.setLineWidth(0.2);
                doc.line(x, y + 0.8, x + word.width, y + 0.8);
            }
            x += word.width;
        });
    }
    return y + lineHeight;
};

/**
 * El PDF de una cuenta de cobro emitida. Devuelve el buffer; quien llama decide si lo
 * guarda o lo sirve, porque el documento se congela al emitir.
 */
/**
 * Cuánto aire lleva el documento. Una cuenta de cobro es una hoja (Elisa, 27 de noviembre de 2026, con la 0426 de
 * Fundación Grit: «ya no me queda incompleta, sino que me aparecen dos»): el concepto cabía, pero el cierre —periodo,
 * consignación y firma— no se parte, y saltaba entero a una segunda página casi vacía. Antes de abrir otra hoja se
 * prueba con menos espacio entre bloques y, en último caso, con la letra del concepto medio punto menor y el
 * interlineado más cerrado. La firma conserva siempre su espacio. Si ni así cabe, el documento va en dos páginas con el aire de siempre.
 */
// La firma escaneada mide 15 mm: su hueco nunca se recorta.
const SIGNATURE_GAP = 22;

export const RECEIVABLE_LAYOUTS = [
    { name: 'normal', gap: 1, conceptSize: CONCEPT_TYPOGRAPHY.size, lineGap: CONCEPT_TYPOGRAPHY.lineGap },
    { name: 'compacto', gap: 0.7, conceptSize: CONCEPT_TYPOGRAPHY.size, lineGap: 0.8 },
    { name: 'ajustado', gap: 0.5, conceptSize: 9, lineGap: 0.6 }
];

export const generateReceivablePdfBuffer = (receivable, env = {}) => {
    const model = buildReceivableDocumentModel(receivable, env);
    if (!model.amountInWords) {
        throw new Error('El importe de la cuenta de cobro no se puede escribir en letras.');
    }
    let first = null;
    for (const layout of RECEIVABLE_LAYOUTS) {
        const doc = drawReceivable(receivable, model, layout);
        if (doc.getNumberOfPages() === 1) return Buffer.from(doc.output('arraybuffer'));
        first ||= doc;
    }
    return Buffer.from(first.output('arraybuffer'));
};

const drawReceivable = (receivable, model, layout) => {
    const doc = newReceivableDocument();
    const gap = (value) => value * layout.gap;

    // Marca arriba a la derecha, como en el documento de Word.
    drawDocumentLogo(doc);

    let y = PAGE.top + 4;
    setText(doc, { size: 10.5 });
    doc.text(model.place, PAGE.left, y);
    y += gap(11);
    setText(doc, { size: 10.5 });
    doc.text('Cuenta de cobro ', PAGE.left, y);
    setText(doc, { size: 10.5, style: 'bold' });
    doc.text(formatReceivableNumber(receivable.number), PAGE.left + doc.getTextWidth('Cuenta de cobro '), y);

    y += gap(16);
    y = centered(doc, model.debtorName, y, { size: 11, style: 'bold' });
    // Sin documento en la ficha no hay línea que imprimir: emitir ya no lo exige.
    if (model.debtorDocument) y = centered(doc, model.debtorDocument, y, { size: 10.5 });
    y += gap(6);
    y = centered(doc, 'Debe a:', y, { size: 10.5 });
    y += gap(5);
    y = centered(doc, model.issuer.name, y, { size: 11, style: 'bold' });
    y = centered(doc, model.issuer.documentLabel, y, { size: 10.5 });
    y += gap(6);
    y = centered(doc, 'La suma de:', y, { size: 10.5 });
    y = centered(doc, model.amountInWords, y, { size: 11, style: 'bold' });
    y = centered(doc, model.amountInFigures, y, { size: 11, style: 'bold' });

    y += gap(8);
    setText(doc, { size: 10.5, style: 'bold' });
    doc.text('Por concepto de:', PAGE.left, y);
    y += Math.max(5, gap(7));
    const concept = { ...CONCEPT_TYPOGRAPHY, size: layout.conceptSize, lineGap: layout.lineGap };
    for (const [index, block] of model.concept.entries()) {
        // Un título abre sección: lleva aire por encima para no pegarse a la lista anterior.
        if (block.kind === 'heading' && index > 0) y += 3;
        y = ensureSpace(doc, y, 8);
        const indent = block.kind === 'bullet' ? concept.indent : 0;
        if (block.kind === 'bullet' && !block.continuation) {
            if (block.ordinal) {
                setText(doc, { size: concept.size });
                doc.text(`${block.ordinal}.`, PAGE.left + 1.2, y, { charSpace: concept.charSpace });
            } else {
                // Un punto pequeño a media altura de las minúsculas, no el ● a tamaño de texto.
                doc.setFillColor(...COLORS.ink);
                doc.circle(PAGE.left + 2.6, y - concept.size * 0.1, concept.bulletRadius, 'F');
            }
        }
        const heading = block.kind === 'heading';
        y = drawConceptBlock(doc, block.runs, y, {
            left: PAGE.left + indent,
            width: CONTENT_WIDTH - indent,
            size: heading ? concept.headingSizes[block.level] || concept.headingSizes[3] : concept.size,
            charSpace: concept.charSpace,
            lineGap: concept.lineGap,
            heading
        });
        y += block.kind === 'bullet' ? 0.4 : heading ? 1.6 : 1.2;
    }

    if (model.items.length) {
        y += 3;
        const valueWidth = 34;
        const descriptionWidth = CONTENT_WIDTH - valueWidth;
        const rowLineHeight = 4.6;
        const prepareRow = (label, value, { bold = false, head = false } = {}) => {
            setText(doc, { size: 10, style: bold || head ? 'bold' : 'normal' });
            const lines = doc.splitTextToSize(label, descriptionWidth - 5);
            return { lines, value, bold, head, height: 7 + (lines.length - 1) * rowLineHeight };
        };
        const drawRow = ({ lines, value, bold, head, height }) => {
            doc.setFillColor(...(head ? COLORS.headRow : COLORS.white));
            doc.setDrawColor(...COLORS.border);
            doc.rect(PAGE.left, y, descriptionWidth, height, 'FD');
            doc.rect(PAGE.left + descriptionWidth, y, valueWidth, height, 'FD');
            setText(doc, { size: 10, style: bold || head ? 'bold' : 'normal' });
            lines.forEach((line, index) => doc.text(line, PAGE.left + 2.5, y + 4.8 + index * rowLineHeight));
            doc.text(value, PAGE.left + descriptionWidth + valueWidth - 2.5, y + 4.8, { align: 'right' });
            y += height;
        };
        const header = prepareRow('Descripción', 'Valor', { head: true });
        const rows = model.items.map(item => prepareRow(item.description, item.formatted));
        const total = prepareRow('Total', model.formattedTotal, { bold: true });
        // La cabecera nunca queda sola al pie de una página. Cada continuación la
        // repite y conserva juntos la última fila y su total.
        y = ensureSpace(doc, y, header.height + rows[0].height);
        drawRow(header);
        const pageBottom = PAGE.height - PAGE.bottom;
        const linesHeight = count => 7 + (count - 1) * rowLineHeight;
        const newPage = () => { doc.addPage(); y = PAGE.top + 4; drawRow(header); };
        for (const [index, row] of rows.entries()) {
            const reserve = index === rows.length - 1 ? total.height : 0;
            if (y + row.height + reserve <= pageBottom) { drawRow(row); continue; }
            if (PAGE.top + 4 + header.height + row.height + reserve <= pageBottom) { newPage(); drawRow(row); continue; }
            // Un concepto más largo que una página (sin límite de caracteres desde el 27 de
            // noviembre de 2026) sigue en la siguiente con la cabecera repetida; el valor va en
            // su primer tramo y la última línea nunca queda sola con el total.
            let lines = row.lines;
            let first = true;
            while (lines.length) {
                const all = linesHeight(lines.length) + reserve <= pageBottom - y;
                const fit = all ? lines.length : Math.min(Math.floor((pageBottom - y - 7) / rowLineHeight) + 1, lines.length - 1);
                if (fit < 2 && !all) { newPage(); continue; }
                drawRow({ ...row, lines: lines.slice(0, fit), value: first ? row.value : '', height: linesHeight(fit) });
                lines = lines.slice(fit);
                first = false;
                if (lines.length) newPage();
            }
        }
        drawRow(total);
    }

    // El concepto ya paginaba, pero el resto seguía dibujándose por debajo del
    // borde. Medimos el cierre completo antes de colocarlo, sin reducir la letra
    // ni perder la firma cuando el concepto termina cerca del margen inferior.
    const bodyLineHeight = 10.5 * 0.42 + 1.1;
    setText(doc, { size: 10.5, style: 'bold' });
    const periodLabelWidth = doc.getTextWidth('Periodo: ');
    setText(doc, { size: 10.5 });
    const periodLines = doc.splitTextToSize(String(model.servicePeriod || ''), CONTENT_WIDTH - periodLabelWidth);
    const bankLines = doc.splitTextToSize(model.bankLine, CONTENT_WIDTH);
    setText(doc, { size: 10.5, style: 'bold' });
    const nameLines = doc.splitTextToSize(model.issuer.name.replace(/\b\p{Lu}\p{Lu}+\b/gu, word => word.charAt(0) + word.slice(1).toLowerCase()), CONTENT_WIDTH);
    setText(doc, { size: 9.5, color: COLORS.muted });
    const signatureLines = [model.issuer.role, model.issuer.signatureLine, model.issuer.email]
        .flatMap(line => doc.splitTextToSize(line, CONTENT_WIDTH));
    const closingHeight = SIGNATURE_GAP + nameLines.length * 5 + signatureLines.length * 4.6;
    const footerHeight = (periodLines.length - 1) * bodyLineHeight + gap(10) + bankLines.length * bodyLineHeight + gap(10) + closingHeight;
    y += gap(9);
    y = ensureSpace(doc, y, footerHeight);
    setText(doc, { size: 10.5, style: 'bold' });
    doc.text('Periodo:', PAGE.left, y);
    setText(doc, { size: 10.5 });
    periodLines.forEach((line, index) => doc.text(line, PAGE.left + periodLabelWidth, y + index * bodyLineHeight));
    y += (periodLines.length - 1) * bodyLineHeight;

    y += gap(10);
    y = paragraph(doc, model.bankLine, y);

    y += gap(10);
    setText(doc, { size: 10.5 });
    doc.text('Cordialmente,', PAGE.left, y);
    // La firma escaneada va sobre el nombre. Sin ella el hueco queda en blanco, para
    // poder firmar a mano sobre el impreso.
    const signature = model.signatureImage && readSignature(model.signatureImage);
    if (signature) {
        let ratio = 2.5;
        try {
            const properties = doc.getImageProperties(signature);
            if (properties?.width > 0 && properties?.height > 0) ratio = properties.width / properties.height;
        } catch {
            // Sin las medidas se dibuja con la proporción de la rúbrica de la casa.
        }
        doc.addImage(signature, 'PNG', PAGE.left, y + 3, SIGNATURE_HEIGHT_MM * ratio, SIGNATURE_HEIGHT_MM, undefined, 'FAST');
    }
    y += SIGNATURE_GAP;
    setText(doc, { size: 10.5, style: 'bold' });
    for (const line of nameLines) {
        doc.text(line, PAGE.left, y);
        y += 5;
    }
    setText(doc, { size: 9.5, color: COLORS.muted });
    for (const line of signatureLines) {
        doc.text(line, PAGE.left, y);
        y += 4.6;
    }

    return doc;
};

export const RECEIVABLE_PDF_MIME = 'application/pdf';

// La clave del PDF al emitir. Si se regenera porque el guardado no se pudo leer, vuelve
// a guardarse encima de sí mismo en vez de dejar copias sueltas en el bucket.
export const receivablePdfStorageKey = (receivable) => `receivables/${receivable.id}/cuenta-de-cobro-${String(receivable.number).padStart(4, '0')}.pdf`;

// Cada corrección de una cuenta emitida guarda su PDF en una clave propia, con la hora
// UTC: el que ya se había mandado al cliente sigue en el bucket y su clave queda en la
// auditoría, así que siempre se puede ver qué versión recibió.
export const receivablePdfRevisionKey = (receivable, at = new Date()) => {
    const stamp = new Date(at).toISOString().replace(/[-:T]/g, '').slice(0, 14);
    return `receivables/${receivable.id}/cuenta-de-cobro-${String(receivable.number).padStart(4, '0')}-corregida-${stamp}.pdf`;
};

// El nombre del archivo: número, cliente con el nombre de su ficha y mes del periodo.
export const receivablePdfFilename = (receivable) => receivableDocumentFilename({
    number: receivable.number,
    clientName: receivable.client?.name || receivable.sourceLabel || receivable.client?.legalName,
    period: receivable.period
});

const receivableForDocument = {
    items: { orderBy: { sortOrder: 'asc' } },
    client: { select: { id: true, name: true, legalName: true, documentType: true, documentNumber: true } }
};

/**
 * Guarda el PDF en el bucket de evidencia financiera y deja su clave en la obligación.
 *
 * No lanza: el documento se congela al emitir, pero si el almacenamiento no responde,
 * la cuenta de cobro ya está emitida y con número dado, y tumbar la petición haría
 * creer que no lo está. Se avisa por consola y la descarga lo vuelve a intentar.
 */
let warnedAboutStorage = false;
export const storeReceivablePdf = async (prismaClient, storage, receivable, env = process.env, prebuilt = null, keyOverride = null) => {
    // Sin bucket configurado no hay nada que intentar. Se avisa una vez por proceso, no
    // en cada emisión, y la descarga sigue funcionando generando el documento al vuelo.
    if (typeof storage?.isConfigured === 'function' && !storage.isConfigured()) {
        if (!warnedAboutStorage) {
            warnedAboutStorage = true;
            console.warn('[Cuenta de cobro] El almacenamiento de documentos financieros no está configurado: los PDF emitidos no se guardan.');
        }
        return null;
    }
    try {
        const buffer = prebuilt || generateReceivablePdfBuffer(receivable, env);
        const key = keyOverride || receivablePdfStorageKey(receivable);
        await storage.upload({
            key,
            body: buffer,
            mimeType: RECEIVABLE_PDF_MIME,
            size: buffer.length,
            name: receivablePdfFilename(receivable)
        });
        await prismaClient.accountsReceivable.update({ where: { id: receivable.id }, data: { pdfStorageKey: key } });
        return key;
    } catch (error) {
        console.error('[Cuenta de cobro] No fue posible guardar el PDF emitido:', error?.message || error);
        return null;
    }
};

/**
 * El PDF de una cuenta de cobro emitida: el guardado al emitirla si sigue en el bucket,
 * y si no, uno recién generado —que además se intenta guardar—. La descarga nunca se
 * queda sin documento por un problema de almacenamiento.
 */
export const openReceivablePdf = async (prismaClient, storage, receivableId, env = process.env) => {
    const receivable = await prismaClient.accountsReceivable.findUnique({
        where: { id: receivableId },
        include: receivableForDocument
    });
    if (!receivable) {
        throw new FinancialDomainError('RECEIVABLE_NOT_FOUND', 'La cuenta por cobrar no existe.', 404);
    }
    if (!receivable.number) {
        throw new FinancialDomainError(
            'RECEIVABLE_NOT_ISSUED',
            'Esta obligación todavía no tiene cuenta de cobro. Emítela para poder descargarla.',
            409
        );
    }
    // Una cuenta de cobro hecha en Word (13 de noviembre de 2026): aquí solo están su número y su fecha.
    if (receivable.metadata?.externalDocument) {
        throw new FinancialDomainError(
            'RECEIVABLE_DOCUMENT_EXTERNAL',
            `La cuenta de cobro ${formatReceivableNumber(receivable.number)} se hizo fuera de la plataforma: no hay PDF que mostrar.`,
            409
        );
    }
    const filename = receivablePdfFilename(receivable);

    if (receivable.pdfStorageKey) {
        try {
            return { receivable, filename, object: await storage.get(receivable.pdfStorageKey) };
        } catch (error) {
            // Si el objeto guardado no se puede leer —no está, o el bucket no responde—
            // se regenera abajo: el equipo no se queda sin el documento de un cobro que
            // ya está emitido por un problema del almacenamiento.
            console.error('[Cuenta de cobro] No se pudo leer el PDF guardado, se regenera:', error?.message || error);
        }
    }

    const buffer = generateReceivablePdfBuffer(receivable, env);
    await storeReceivablePdf(prismaClient, storage, receivable, env, buffer);
    return { receivable, filename, buffer };
};
