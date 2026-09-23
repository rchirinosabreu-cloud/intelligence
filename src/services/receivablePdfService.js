import { readFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import { amountInWords } from '../utils/amountInWords.js';
import { formatPartyDocument, formatPartyName } from '../lib/partyIdentity.js';
import { pathToFileURL } from 'node:url';
import {
    formatReceivableNumber, parseReceivableConcept, receivableIssuer, RECEIVABLE_ISSUER_DEFAULT_NAME
} from '../lib/receivableDocument.js';
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

const getLogo = () => (cachedLogo ||= `data:image/png;base64,${readFileSync(
    new URL('../../public/brainstudio-logo.png', import.meta.url)
).toString('base64')}`);

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
 * Lo que el documento dice, sin dibujar nada. Separado para poder comprobarlo contra
 * las cuentas de cobro reales sin abrir un PDF.
 */
export const buildReceivableDocumentModel = (receivable, env = {}) => {
    const issuer = receivableIssuer(env);
    const total = Number(receivable.amount) || 0;
    const items = (receivable.items || []).map((item) => ({ description: item.description, amount: Number(item.amount) || 0 }));
    return {
        issuer,
        place: `${issuer.city} ${longDate(receivable.issuedAt)}`,
        title: `Cuenta de cobro ${formatReceivableNumber(receivable.number)}`,
        debtorName: formatPartyName(receivable.client, receivable.client?.name),
        debtorDocument: formatPartyDocument(receivable.client),
        amountInWords: amountInWords(total),
        amountInFigures: `(${money.format(total)})`,
        concept: parseReceivableConcept(receivable.concept),
        // Con un solo concepto el documento no lleva tabla, como el de Elvira Utria.
        items: items.length > 1 ? items : [],
        total,
        servicePeriod: receivable.servicePeriod || null,
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
 * El PDF de una cuenta de cobro emitida. Devuelve el buffer; quien llama decide si lo
 * guarda o lo sirve, porque el documento se congela al emitir.
 */
export const generateReceivablePdfBuffer = (receivable, env = {}) => {
    const model = buildReceivableDocumentModel(receivable, env);
    if (!model.amountInWords) {
        throw new Error('El importe de la cuenta de cobro no se puede escribir en letras.');
    }
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const fonts = getFonts();
    doc.addFileToVFS('WorkSans-Regular.ttf', fonts.regular);
    doc.addFont('WorkSans-Regular.ttf', 'WorkSans', 'normal');
    doc.addFileToVFS('WorkSans-Bold.ttf', fonts.bold);
    doc.addFont('WorkSans-Bold.ttf', 'WorkSans', 'bold');

    // Marca arriba a la derecha, como en el documento de Word.
    doc.addImage(getLogo(), 'PNG', PAGE.width - PAGE.right - 22, PAGE.top - 4, 22, 22, undefined, 'FAST');
    setText(doc, { size: 8, style: 'bold', color: COLORS.muted });
    doc.text('BRAIN STUDIO', PAGE.width - PAGE.right - 11, PAGE.top + 21, { align: 'center' });

    let y = PAGE.top + 4;
    setText(doc, { size: 10.5 });
    doc.text(model.place, PAGE.left, y);
    y += 11;
    setText(doc, { size: 10.5 });
    doc.text('Cuenta de cobro ', PAGE.left, y);
    setText(doc, { size: 10.5, style: 'bold' });
    doc.text(formatReceivableNumber(receivable.number), PAGE.left + doc.getTextWidth('Cuenta de cobro '), y);

    y += 16;
    y = centered(doc, model.debtorName, y, { size: 11, style: 'bold' });
    y = centered(doc, model.debtorDocument, y, { size: 10.5 });
    y += 6;
    y = centered(doc, 'Debe a:', y, { size: 10.5 });
    y += 5;
    y = centered(doc, model.issuer.name, y, { size: 11, style: 'bold' });
    y = centered(doc, model.issuer.documentLabel, y, { size: 10.5 });
    y += 6;
    y = centered(doc, 'La suma de:', y, { size: 10.5 });
    y = centered(doc, model.amountInWords, y, { size: 11, style: 'bold' });
    y = centered(doc, model.amountInFigures, y, { size: 11, style: 'bold' });

    y += 8;
    setText(doc, { size: 10.5, style: 'bold' });
    doc.text('Por concepto de:', PAGE.left, y);
    y += 7;
    for (const block of model.concept) {
        if (block.kind === 'bullet') {
            setText(doc, { size: 10.5 });
            doc.text('●', PAGE.left + 3, y);
            y = paragraph(doc, block.text, y, { left: PAGE.left + 8, width: CONTENT_WIDTH - 8 }) + 0.6;
        } else {
            y = paragraph(doc, block.text, y) + 1.4;
        }
    }

    if (model.items.length) {
        y += 3;
        const valueWidth = 34;
        const descriptionWidth = CONTENT_WIDTH - valueWidth;
        const row = (label, value, { bold = false, head = false } = {}) => {
            doc.setFillColor(...(head ? COLORS.headRow : COLORS.white));
            doc.setDrawColor(...COLORS.border);
            doc.rect(PAGE.left, y, descriptionWidth, 7, 'FD');
            doc.rect(PAGE.left + descriptionWidth, y, valueWidth, 7, 'FD');
            setText(doc, { size: 10, style: bold || head ? 'bold' : 'normal' });
            doc.text(label, PAGE.left + 2.5, y + 4.8);
            doc.text(value, PAGE.left + descriptionWidth + valueWidth - 2.5, y + 4.8, { align: 'right' });
            y += 7;
        };
        row('Descripción', 'Valor', { head: true });
        for (const item of model.items) row(item.description, money.format(item.amount));
        row('Total', money.format(model.total), { bold: true });
    }

    y += 9;
    setText(doc, { size: 10.5, style: 'bold' });
    doc.text('Periodo:', PAGE.left, y);
    setText(doc, { size: 10.5 });
    doc.text(` ${model.servicePeriod}`, PAGE.left + doc.getTextWidth('Periodo:'), y);

    y += 10;
    y = paragraph(doc, model.issuer.bankLine, y);

    y += 10;
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
    y += 22;
    setText(doc, { size: 10.5, style: 'bold' });
    doc.text(model.issuer.name.replace(/\b\p{Lu}\p{Lu}+\b/gu, (word) => word.charAt(0) + word.slice(1).toLowerCase()), PAGE.left, y);
    y += 5;
    setText(doc, { size: 9.5, color: COLORS.muted });
    for (const line of [model.issuer.role, model.issuer.signatureLine, model.issuer.email]) {
        doc.text(line, PAGE.left, y);
        y += 4.6;
    }

    return Buffer.from(doc.output('arraybuffer'));
};

export const RECEIVABLE_PDF_MIME = 'application/pdf';

// Una obligación se emite una sola vez, así que su documento tiene una clave estable:
// vuelve a guardarse encima de sí mismo en vez de dejar copias sueltas en el bucket.
export const receivablePdfStorageKey = (receivable) => `receivables/${receivable.id}/cuenta-de-cobro-${String(receivable.number).padStart(4, '0')}.pdf`;

const safeFilenamePart = (value) => String(value || '').replace(/[\\/:*?"<>|\r\n]/g, ' ').replace(/\s+/g, ' ').trim();

// El nombre con el que llega al correo del cliente: como lo nombra Elisa a mano hoy.
export const receivablePdfFilename = (receivable) => {
    const who = safeFilenamePart(receivable.client?.legalName || receivable.client?.name);
    return `Cuenta de cobro ${formatReceivableNumber(receivable.number)}${who ? ` - ${who}` : ''}.pdf`.slice(0, 180);
};

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
export const storeReceivablePdf = async (prismaClient, storage, receivable, env = process.env, prebuilt = null) => {
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
        const key = receivablePdfStorageKey(receivable);
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
