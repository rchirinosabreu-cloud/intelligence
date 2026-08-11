import prisma from '../lib/prisma.js';
import crypto from 'crypto';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    QuotationValidationError,
    buildNewQuotationValidity,
    buildQuotationValidityUpdate,
    calculateQuotationEconomics,
    calculateQuotationTotals,
    normalizeQuotationExchangeRate,
    prepareQuotationItems,
    serializeCatalogService,
    serializePublicQuotation
} from '../services/quotationDomainService.js';
import { fetchOfficialUsdCopRate } from '../services/exchangeRateService.js';
import {
    QuotationAcceptanceError,
    acceptQuotationBySlug
} from '../services/quotationAcceptanceService.js';

const MANDATORY_TERMS = `● El cliente tendrá un delegado quien será el contacto directo con la empresa prestadora del servicio BRAIN STUDIO, y se encargará de brindar la información necesaria para el desarrollo de los servicios.
● Las modificaciones de productos deben cumplir con un estándar mínimo de 2 correcciones con el fin de optimizar tiempo y recursos. Si el cliente requiere corregir un contenido luego de estar aprobado tiene un costo adicional.
● El cliente debe comprometerse a suministrar la información mínima necesaria para poder desarrollar contenidos.
● El envío de contenidos (textos, guiones, archivos multimedia) y los comentarios sobre estos, se realizan a través de WhatsApp o correo electrónico, con el fin de tener una comunicación más efectiva, clara y con trazabilidad.
● El método de pago será 50% para iniciar, conforme a las fechas programadas.
● La inversión de pauta publicitaria será asumida por el cliente.
● En caso de requerir factura electrónica se debe adicionar el 19% de IVA.
● El cliente tiene la posibilidad de acceder a cualquier otro producto o servicio ofrecido por Brain Studio fuera de la propuesta, con un valor adicional. (videos, fotografía, aplicación de marca, asesorías, etc).
● La propuesta tiene una vigencia de 15 días calendario.`;

const EMISORES_DATA = {
    BRAIN_STUDIO: {
        razonSocial: 'BRAIN STUDIO AGENCIA CREATIVA S.A.S',
        nit: '901533409',
        email: 'social.brainstudio@gmail.com',
        whatsapp: '+57 300 4329276'
    },
    FRANCISCO_VILLA: {
        nombre: 'Francisco Villa Zúñiga',
        identificacion: 'CC 1.235.038.569',
        email: 'fvilladigital@gmail.com',
        whatsapp: '+57 300 4329276'
    }
};

const VALID_EMISORES = new Set(['BRAIN_STUDIO', 'FRANCISCO_VILLA']);
const VALID_CURRENCIES = new Set(['COP', 'USD']);
const VALID_STATUSES = new Set(['BORRADOR', 'ACTIVA']);

const findCatalogServicesForItems = async (items = []) => {
    const ids = [...new Set(items.map((item) => item?.serviceId).filter(Boolean))];
    if (ids.length === 0) return [];
    return prisma.serviceCatalog.findMany({ where: { id: { in: ids } } });
};

const sendQuotationError = (res, error, fallbackMessage) => {
    if (error instanceof QuotationValidationError) {
        return res.status(error.statusCode).json({ error: error.message });
    }
    if (error?.code === 'P2025') {
        return res.status(404).json({ error: 'Cotizacion no encontrada' });
    }
    return res.status(500).json({ error: fallbackMessage });
};

const validateQuotationEnums = ({ emisorType, currency, status }) => {
    if (!VALID_EMISORES.has(emisorType)) throw new QuotationValidationError('Emisor invalido');
    if (!VALID_CURRENCIES.has(currency)) throw new QuotationValidationError('Moneda invalida');
    if (!VALID_STATUSES.has(status)) throw new QuotationValidationError('Estado de cotizacion invalido');
};

/**
 * Creates a new quotation with financial rules and contractual sanitization.
 */
export const createQuotation = async (req, res) => {
    try {
        const {
            emisor_type,
            client_name,
            client_company,
            client_email,
            client_phone,
            client_type, // "EMPRESA" or "PERSONA_NATURAL"
            items, // Array: [{ serviceId, name, description, price, quantity, note }]
            currency = 'COP',
            status = 'ACTIVA',
            exchange_rate,
            exchange_rate_source,
            exchange_rate_date,
            is_tax_exempt: manual_tax_exempt
        } = req.body;

        validateQuotationEnums({ emisorType: emisor_type, currency, status });
        const isDraft = status === 'BORRADOR';
        if (!isDraft && (!client_name || !client_phone || !Array.isArray(items) || items.length === 0)) {
            return res.status(400).json({ error: "Faltan campos obligatorios" });
        }

        const rawItems = Array.isArray(items) ? items : [];
        const catalogServices = await findCatalogServicesForItems(rawItems);
        const preparedItems = prepareQuotationItems(rawItems, catalogServices);
        const exchangeRateSnapshot = normalizeQuotationExchangeRate({
            currency,
            exchangeRate: exchange_rate,
            exchangeRateSource: exchange_rate_source,
            exchangeRateDate: exchange_rate_date
        });

        // 2. Generate UUID Slug and validity window (15 days)
        const uuid_slug = crypto.randomUUID();
        const created_at = new Date();
        const validity = buildNewQuotationValidity(status, created_at);

        // 3. Automated VAT (IVA) Logic
        let is_tax_exempt = (emisor_type === 'FRANCISCO_VILLA' || client_type === 'PERSONA_NATURAL');

        // Respect manual override if provided
        if (manual_tax_exempt !== undefined) {
            is_tax_exempt = manual_tax_exempt;
        }

        // 4. Financial Calculations
        const { subtotal, taxAmount: tax_amount, totalAmount: total_amount } = calculateQuotationTotals(
            preparedItems,
            is_tax_exempt
        );

        // 5. Terms and Conditions (Immutable + Sanitization)
        let final_terms = MANDATORY_TERMS;
        if (emisor_type === 'FRANCISCO_VILLA') {
            final_terms = final_terms.replace(/BRAIN STUDIO/gi, "El Prestador");
            final_terms = final_terms.replace(/Brain Studio/gi, "El Prestador");
        }

        // 6. Persistence
        const quotation = await prisma.quotation.create({
            data: {
                uuid_slug,
                emisor_type: emisor_type || 'BRAIN_STUDIO',
                status: status || 'ACTIVA',
                client_name: client_name || 'Borrador',
                client_company: client_type === 'EMPRESA' ? client_company : null,
                client_email: client_email || '',
                client_phone: client_phone || '',
                is_tax_exempt,
                items: preparedItems,
                currency,
                ...exchangeRateSnapshot,
                subtotal,
                tax_amount,
                total_amount,
                terms_and_conditions: final_terms,
                created_at,
                ...validity
            }
        });

        // Format for response if needed
        const formattedConsecutive = `COT-${String(quotation.consecutive).padStart(4, '0')}`;

        res.status(201).json({
            ...quotation,
            consecutive_formatted: formattedConsecutive
        });
    } catch (error) {
        console.error("[QuotationController] Create failed:", error);
        sendQuotationError(res, error, "Error al crear la cotizacion");
    }
};

/**
 * Updates an existing quotation regardless of status.
 */
export const updateQuotation = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            emisor_type,
            client_name,
            client_company,
            client_email,
            client_phone,
            client_type,
            items,
            currency,
            status,
            exchange_rate,
            exchange_rate_source,
            exchange_rate_date,
            is_tax_exempt: manual_tax_exempt
        } = req.body;

        const existing = await prisma.quotation.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: "Cotizacion no encontrada" });
        if (existing.status === 'APROBADA') {
            return res.status(409).json({ error: "Una cotizacion aprobada no puede modificarse" });
        }

        const targetStatus = status || existing.status;
        const targetEmisor = emisor_type || existing.emisor_type;
        const targetCurrency = currency || existing.currency;
        const rawItems = Array.isArray(items) ? items : (Array.isArray(existing.items) ? existing.items : []);
        validateQuotationEnums({ emisorType: targetEmisor, currency: targetCurrency, status: targetStatus });

        const isDraft = targetStatus === 'BORRADOR';
        if (!isDraft && (!client_name || !client_phone || rawItems.length === 0)) {
            return res.status(400).json({ error: "Faltan campos obligatorios para emitir" });
        }

        const catalogServices = await findCatalogServicesForItems(rawItems);
        const preparedItems = prepareQuotationItems(rawItems, catalogServices, existing.items || []);
        const exchangeRateSnapshot = normalizeQuotationExchangeRate({
            currency: targetCurrency,
            exchangeRate: exchange_rate ?? existing.exchange_rate,
            exchangeRateSource: exchange_rate_source ?? existing.exchange_rate_source,
            exchangeRateDate: exchange_rate_date ?? existing.exchange_rate_date
        });

        let is_tax_exempt = (targetEmisor === 'FRANCISCO_VILLA' || client_type === 'PERSONA_NATURAL');
        if (manual_tax_exempt !== undefined) is_tax_exempt = manual_tax_exempt;

        const { subtotal, taxAmount: tax_amount, totalAmount: total_amount } = calculateQuotationTotals(
            preparedItems,
            is_tax_exempt
        );

        let final_terms = MANDATORY_TERMS;
        if (targetEmisor === 'FRANCISCO_VILLA') {
            final_terms = final_terms.replace(/BRAIN STUDIO/gi, "El Prestador");
            final_terms = final_terms.replace(/Brain Studio/gi, "El Prestador");
        }

        const quotation = await prisma.quotation.update({
            where: { id },
            data: {
                emisor_type: targetEmisor,
                status: targetStatus,
                client_name,
                client_company: client_type === 'EMPRESA' ? client_company : null,
                client_email,
                client_phone,
                is_tax_exempt,
                items: preparedItems,
                currency: targetCurrency,
                ...exchangeRateSnapshot,
                subtotal,
                tax_amount,
                total_amount,
                terms_and_conditions: final_terms,
                ...buildQuotationValidityUpdate(existing, targetStatus)
            }
        });

        res.json({
            ...quotation,
            consecutive_formatted: `COT-${String(quotation.consecutive).padStart(4, '0')}`
        });

    } catch (error) {
        console.error("[QuotationController] Update failed:", error);
        sendQuotationError(res, error, "Error al actualizar la cotizacion");
    }
};

/**
 * Public endpoint to retrieve a quotation by its token.
 */
export const getPublicQuotation = async (req, res) => {
    try {
        const { uuid_slug } = req.params;

        const quotation = await prisma.quotation.findUnique({
            where: { uuid_slug }
        });

        if (!quotation) {
            return res.status(404).json({ error: "Cotización no encontrada" });
        }

        const publicQuotation = serializePublicQuotation(quotation);
        if (!publicQuotation) {
            return res.status(404).json({ error: "Cotización no encontrada" });
        }

        const now = new Date();
        const isExpired = quotation.status === 'ACTIVA' && now > quotation.expires_at;

        const emisor_data = EMISORES_DATA[quotation.emisor_type] || {};

        res.json({
            ...publicQuotation,
            consecutive_formatted: `COT-${String(quotation.consecutive).padStart(4, '0')}`,
            emisor_data,
            isExpired
        });
    } catch (error) {
        console.error("[QuotationController] Fetch public failed:", error);
        res.status(500).json({ error: "Error al obtener la cotizacion" });
    }
};

export const acceptPublicQuotation = async (req, res) => {
    try {
        const { quotation, alreadyAccepted } = await acceptQuotationBySlug({
            db: prisma,
            slug: req.params.uuid_slug
        });
        const publicQuotation = serializePublicQuotation(quotation);
        const emisor_data = EMISORES_DATA[quotation.emisor_type] || {};

        res.json({
            ...publicQuotation,
            consecutive_formatted: `COT-${String(quotation.consecutive).padStart(4, '0')}`,
            emisor_data,
            isExpired: false,
            alreadyAccepted
        });
    } catch (error) {
        console.error("[QuotationController] Public acceptance failed:", error);
        if (error instanceof QuotationAcceptanceError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        return res.status(500).json({ error: "Error al aprobar la cotizacion" });
    }
};

export const getExchangeRate = async (_req, res) => {
    try {
        const rate = await fetchOfficialUsdCopRate();
        res.json(rate);
    } catch (error) {
        console.error("[QuotationController] Exchange rate fetch failed:", error);
        res.status(503).json({
            error: "No fue posible consultar la TRM oficial. Puedes registrar una tasa manual."
        });
    }
};

/**
 * List all quotations (Admin view).
 */
/**
 * GET /api/quotations/:id
 * Admin endpoint to retrieve a single quotation for editing
 */
export const getQuotation = async (req, res) => {
    try {
        const { id } = req.params;
        const quotation = await prisma.quotation.findUnique({
            where: { id }
        });

        if (!quotation) {
            return res.status(404).json({ error: "Cotización no encontrada" });
        }

        res.json({
            ...quotation,
            consecutive_formatted: `COT-${String(quotation.consecutive).padStart(4, '0')}`,
            isExpired: quotation.status === 'ACTIVA' && new Date() > quotation.expires_at,
            profitability: calculateQuotationEconomics(quotation.items || [], {
                currency: quotation.currency,
                exchangeRate: quotation.exchange_rate
            })
        });
    } catch (error) {
        console.error("[QuotationController] Fetch failed:", error);
        res.status(500).json({ error: "Error al obtener la cotización" });
    }
};

export const listQuotations = async (req, res) => {
    try {
        const quotations = await prisma.quotation.findMany({
            orderBy: { created_at: 'desc' }
        });

        const formatted = quotations.map(q => ({
            ...q,
            consecutive_formatted: `COT-${String(q.consecutive).padStart(4, '0')}`,
            isExpired: q.status === 'ACTIVA' && new Date() > q.expires_at
        }));

        res.json(formatted);
    } catch (error) {
        console.error("[QuotationController] List failed:", error);
        res.status(500).json({ error: "Error al listar cotizaciones" });
    }
};

/**
 * Generates a PDF for a quotation.
 */
export const generateQuotationPDF = async (req, res) => {
    try {
        const { id } = req.params;
        const quotation = await prisma.quotation.findUnique({ where: { id } });

        if (!quotation) return res.status(404).json({ error: "Cotización no encontrada" });

        const doc = new jsPDF();
        const emisor = EMISORES_DATA[quotation.emisor_type];
        const consecutive = `COT-${String(quotation.consecutive).padStart(4, '0')}`;

        // Header
        doc.setFontSize(20);
        doc.text(quotation.emisor_type === 'BRAIN_STUDIO' ? 'BRAIN STUDIO' : emisor.nombre, 105, 20, { align: 'center' });
        doc.setFontSize(10);
        doc.text(quotation.emisor_type === 'BRAIN_STUDIO' ? `NIT: ${emisor.nit}` : emisor.identificacion, 105, 26, { align: 'center' });
        doc.text(emisor.email, 105, 31, { align: 'center' });

        doc.setFontSize(14);
        doc.text(`PROPUESTA COMERCIAL: ${consecutive}`, 20, 45);
        doc.setFontSize(10);
        doc.text(`Fecha: ${new Date(quotation.created_at).toLocaleDateString()}`, 20, 52);

        // Client Info
        doc.setFontSize(12);
        doc.text('INFORMACIÓN DEL CLIENTE', 20, 65);
        doc.setFontSize(10);
        doc.text(`Cliente: ${quotation.client_name}`, 20, 72);
        if (quotation.client_company) doc.text(`Empresa: ${quotation.client_company}`, 20, 77);
        doc.text(`Email: ${quotation.client_email}`, 20, 82);
        doc.text(`Teléfono: ${quotation.client_phone}`, 20, 87);

        // Services Table
        const tableData = (quotation.items || []).map((item, index) => [
            index + 1,
            item.name,
            item.quantity,
            new Intl.NumberFormat('es-CO', { style: 'currency', currency: quotation.currency }).format(item.price),
            new Intl.NumberFormat('es-CO', { style: 'currency', currency: quotation.currency }).format(item.price * item.quantity)
        ]);

        autoTable(doc, {
            startY: 95,
            head: [['#', 'Servicio', 'Cant.', 'Precio Unit.', 'Subtotal']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] }
        });

        // jspdf-autotable uses doc.lastAutoTable to store metadata about the last rendered table
        const finalY = doc.lastAutoTable.finalY + 10;
        doc.text(`Subtotal: ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: quotation.currency }).format(quotation.subtotal)}`, 140, finalY);
        if (!quotation.is_tax_exempt) {
            doc.text(`IVA (19%): ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: quotation.currency }).format(quotation.tax_amount)}`, 140, finalY + 5);
        }
        doc.setFontSize(12);
        doc.text(`TOTAL: ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: quotation.currency }).format(quotation.total_amount)}`, 140, finalY + 12);

        // T&C
        const termsY = finalY + 30;
        doc.setFontSize(10);
        doc.text('TÉRMINOS Y CONDICIONES', 20, termsY);
        const splitTerms = doc.splitTextToSize(quotation.terms_and_conditions, 170);
        doc.setFontSize(8);
        doc.text(splitTerms, 20, termsY + 7);

        const pdfOutput = doc.output('arraybuffer');
        const buffer = Buffer.from(pdfOutput);

        res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="Propuesta_${consecutive}.pdf"`,
            'Content-Length': buffer.length,
            'Cache-Control': 'no-cache'
        });

        res.end(buffer);

    } catch (error) {
        console.error("[QuotationController] PDF gen failed:", error);
        res.status(500).json({ error: "Error al generar el PDF" });
    }
};

/**
 * Get the full service catalog for quotations.
 */
export const getCatalog = async (req, res) => {
    try {
        const catalog = await prisma.serviceCatalog.findMany({
            orderBy: [{ category: 'asc' }, { name: 'asc' }]
        });
        res.json(catalog.map(serializeCatalogService));
    } catch (error) {
        console.error("[QuotationController] Catalog fetch failed:", error);
        res.status(500).json({ error: "Error al obtener el catálogo de servicios" });
    }
};
