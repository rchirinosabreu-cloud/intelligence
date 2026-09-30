// Lo que la cuenta de cobro necesita tanto en el servidor como en la pantalla. Vive
// aquí y no en el servicio para que el formulario no arrastre código de servidor.

// El párrafo de apertura es idéntico en las cuentas de cobro reales 0366 y 0389: solo
// cambian las viñetas de debajo. Se ofrece escrito para no teclearlo cada mes.
export const RECEIVABLE_CONCEPT_DEFAULT = 'Prestación de servicios para el diseño y ejecución de estrategias de comunicación digital para la marca, con el objetivo de visibilizar, posicionar y promocionar los servicios y productos que ofrecen en las diferentes redes sociales. Este servicio incluye:';

export const RECEIVABLE_ITEM_MAX = 40;
export const RECEIVABLE_CONCEPT_MAX = 4000;
export const RECEIVABLE_ITEM_DESCRIPTION_MAX = 300;
export const RECEIVABLE_SERVICE_PERIOD_MAX = 120;

/**
 * Quien cobra. Brain Studio como empresa no emite cuentas de cobro (Rodny, 22 de
 * septiembre de 2026): las firma Francisco Villa como persona natural, y eso es lo
 * que las hace cuenta de cobro y no factura — por eso nunca llevan IVA.
 * Se puede cambiar por entorno sin tocar el código.
 */
export const RECEIVABLE_ISSUER_DEFAULT_NAME = 'FRANCISCO VILLA ZÚÑIGA';

export const receivableIssuer = (env = {}) => ({
    city: env.RECEIVABLE_ISSUER_CITY || 'Cartagena de Indias D.T y C.',
    name: env.RECEIVABLE_ISSUER_NAME || RECEIVABLE_ISSUER_DEFAULT_NAME,
    documentLabel: env.RECEIVABLE_ISSUER_DOCUMENT || "CC. 1'235.038.569",
    role: env.RECEIVABLE_ISSUER_ROLE || 'Representante Brain Studio',
    signatureLine: env.RECEIVABLE_ISSUER_SIGNATURE_LINE || 'C.C. 1235038569 - Celular: 3015201362',
    email: env.RECEIVABLE_ISSUER_EMAIL || 'fvilladigita@gmail.com',
    bankLine: env.RECEIVABLE_ISSUER_BANK_LINE
        || "Por favor, consignar a la Cuenta de Ahorros Bancolombia 08579170345 a nombre de Francisco Villa Zúñiga, CC 1'235,038,569 de Cartagena.",
    // Cómo pagar una cuenta en dólares, si es distinto de consignar en pesos. Sin
    // configurar, el documento usa la instrucción de siempre.
    bankLineUsd: env.RECEIVABLE_ISSUER_BANK_LINE_USD || null
});

// Una línea que empieza por guion o viñeta es un punto de la lista; el resto es
// párrafo. Es la convención que se explica en el propio formulario, para que Elisa
// escriba el concepto como lo escribe hoy en Word y salga igual.
const BULLET_START = /^\s*[-*•●]\s*/;

// El concepto se escribe con la barra de formato de la plataforma (Rodny, 30 de
// septiembre de 2026) y se guarda como el HTML del editor. Las cuentas anteriores lo
// guardaron en texto plano; las dos formas conviven y se distinguen por la etiqueta de
// apertura, que el editor siempre pone y que un texto escrito a mano no empieza nunca.
const CONCEPT_HTML_START = /^\s*<(p|h[1-3]|ul|ol)[\s>]/i;
export const isReceivableConceptHtml = (value) => typeof value === 'string' && CONCEPT_HTML_START.test(value);

const escapeHtml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/**
 * Lo que el editor recibe al abrir una cuenta. Un concepto viejo en texto plano se
 * convierte a formato: cada línea es un párrafo y las que empiezan por guion, una
 * viñeta de verdad, para que al corregirla no se funda todo en un solo párrafo.
 */
export const receivableConceptToHtml = (concept) => {
    if (isReceivableConceptHtml(concept)) return concept;
    let html = '';
    let inList = false;
    for (const line of String(concept ?? '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
        const bullet = BULLET_START.test(line);
        const text = escapeHtml(bullet ? line.replace(BULLET_START, '').trim() : line);
        if (bullet && !inList) { html += '<ul>'; inList = true; }
        if (!bullet && inList) { html += '</ul>'; inList = false; }
        html += bullet ? `<li><p>${text}</p></li>` : `<p>${text}</p>`;
    }
    return inList ? `${html}</ul>` : html;
};

export const parseReceivableConcept = (concept) => String(concept ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (BULLET_START.test(line)
        ? { kind: 'bullet', text: line.replace(BULLET_START, '').trim() }
        : { kind: 'paragraph', text: line }))
    .filter((block) => block.text);

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const safeFilenamePart = (value) => String(value || '').replace(/[\\/:*?"<>|\r\n]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * El nombre del PDF al descargarlo o verlo (Rodny, 30 de septiembre de 2026): «Cuenta de
 * Cobro No. 0396 - Fundación Grit - Septiembre 2026». El cliente con el nombre de su ficha
 * y el mes y año del periodo de la cuenta. Lo usan el servidor y la pantalla, para que el
 * archivo se llame igual se baje por donde se baje. El periodo se lee en UTC, como se
 * guarda; sin periodo no se inventa un mes.
 */
export const receivableDocumentFilename = ({ number, clientName, period } = {}) => {
    const date = period ? new Date(String(period).length === 10 ? `${period}T12:00:00Z` : period) : null;
    const month = date && !Number.isNaN(date.getTime()) ? `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}` : '';
    const parts = [`Cuenta de Cobro ${formatReceivableNumber(number)}`, safeFilenamePart(clientName), month].filter(Boolean);
    return `${parts.join(' - ').slice(0, 176)}.pdf`;
};

// Como lo escribe el documento real: «Cuenta de cobro No. 0389», cuatro dígitos y
// sin prefijo de letras. No es un formato nuestro, es el que ya reciben los clientes.
export const formatReceivableNumber = (number) => {
    // `Number(null)` es 0 y `Number.isInteger(0)` es true: sin este guardia una
    // obligación sin emitir se presentaría como «No. null».
    if (number === null || number === undefined || number === '') return null;
    const value = Number(number);
    return Number.isInteger(value) && value > 0 ? `No. ${String(value).padStart(4, '0')}` : null;
};
