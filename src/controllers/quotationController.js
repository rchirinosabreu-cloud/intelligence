import prisma from '../lib/prisma.js';
import crypto from 'crypto';
import { generateQuotationPdfBuffer } from '../services/quotationPdfService.js';
import {
    buildContractTermsText,
    resolveSuggestedContractTermIds,
    sanitizeContractTermsText
} from '../services/quotationContractTerms.js';
import {
    QuotationValidationError,
    buildNewQuotationValidity,
    buildQuotationValidityUpdate,
    calculateQuotationEconomics,
    calculateQuotationTotals,
    isScenarioQuotation,
    normalizeQuotationTaxForCurrency,
    normalizeQuotationExchangeRate,
    normalizeQuotationDiscount,
    normalizeQuotationDuration,
    prepareQuotationItems,
    resolveQuotationTaxExemption,
    serializeCatalogService,
    serializePublicQuotation
} from '../services/quotationDomainService.js';
import { fetchOfficialUsdCopRate } from '../services/exchangeRateService.js';
import {
    QuotationAcceptanceError,
    acceptQuotationBySlug
} from '../services/quotationAcceptanceService.js';

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

const adaptTermsForIssuer = (terms, emisorType) => {
    if (emisorType === 'FRANCISCO_VILLA') {
        return terms.replace(/BRAIN STUDIO/gi, 'El Prestador').replace(/Brain Studio/gi, 'El Prestador');
    }
    return terms;
};

const buildQuotationTerms = ({ services, emisorType, currency, isTaxExempt }) => adaptTermsForIssuer(
    buildContractTermsText(resolveSuggestedContractTermIds(services, { currency, isTaxExempt })),
    emisorType
);

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
            is_tax_exempt: manual_tax_exempt,
            duration_months = 3,
            discount_type,
            discount_value,
            discount_label,
            terms_and_conditions
        } = req.body;

        validateQuotationEnums({ emisorType: emisor_type, currency, status });
        const isDraft = status === 'BORRADOR';
        if (!isDraft && (!client_name || !client_phone || !Array.isArray(items) || items.length === 0)) {
            return res.status(400).json({ error: "Faltan campos obligatorios" });
        }

        const rawItems = Array.isArray(items) ? items : [];
        const catalogServices = await findCatalogServicesForItems(rawItems);
        const preparedItems = prepareQuotationItems(rawItems, catalogServices);
        const durationMonths = normalizeQuotationDuration(duration_months);
        const discount = normalizeQuotationDiscount({
            type: discount_type,
            value: discount_value,
            label: discount_label
        });
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
        const is_tax_exempt = resolveQuotationTaxExemption({
            currency,
            emisorType: emisor_type,
            clientType: client_type,
            manualTaxExempt: manual_tax_exempt
        });

        // 4. Financial Calculations
        const scenarioMode = isScenarioQuotation(preparedItems);
        const totals = scenarioMode
            ? { subtotal: 0, discountAmount: 0, taxAmount: 0, totalAmount: 0 }
            : calculateQuotationTotals(preparedItems, is_tax_exempt, {
                durationMonths,
                discountType: discount.discountType,
                discountValue: discount.discountValue
            });

        // 5. Terms and Conditions (Immutable + Sanitization)
        const hasExplicitTerms = Object.prototype.hasOwnProperty.call(req.body, 'terms_and_conditions');
        const final_terms = hasExplicitTerms
            ? adaptTermsForIssuer(sanitizeContractTermsText(terms_and_conditions), emisor_type)
            : buildQuotationTerms({ services: catalogServices, emisorType: emisor_type, currency, isTaxExempt: is_tax_exempt });

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
                duration_months: durationMonths,
                discount_type: scenarioMode ? null : discount.discountType,
                discount_value: scenarioMode ? 0 : discount.discountValue,
                discount_label: scenarioMode ? null : (discount.discountLabel || null),
                discount_amount: totals.discountAmount,
                currency,
                ...exchangeRateSnapshot,
                subtotal: totals.subtotal,
                tax_amount: totals.taxAmount,
                total_amount: totals.totalAmount,
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
            is_tax_exempt: manual_tax_exempt,
            duration_months,
            discount_type,
            discount_value,
            discount_label,
            terms_and_conditions
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
        const durationMonths = normalizeQuotationDuration(duration_months ?? existing.duration_months ?? 1);
        const discount = normalizeQuotationDiscount({
            type: discount_type ?? existing.discount_type,
            value: discount_value ?? existing.discount_value,
            label: discount_label ?? existing.discount_label
        });
        const exchangeRateSnapshot = normalizeQuotationExchangeRate({
            currency: targetCurrency,
            exchangeRate: exchange_rate ?? existing.exchange_rate,
            exchangeRateSource: exchange_rate_source ?? existing.exchange_rate_source,
            exchangeRateDate: exchange_rate_date ?? existing.exchange_rate_date
        });

        const is_tax_exempt = resolveQuotationTaxExemption({
            currency: targetCurrency,
            emisorType: targetEmisor,
            clientType: client_type,
            manualTaxExempt: manual_tax_exempt
        });

        const scenarioMode = isScenarioQuotation(preparedItems);
        const totals = scenarioMode
            ? { subtotal: 0, discountAmount: 0, taxAmount: 0, totalAmount: 0 }
            : calculateQuotationTotals(preparedItems, is_tax_exempt, {
                durationMonths,
                discountType: discount.discountType,
                discountValue: discount.discountValue
            });

        const hasExplicitTerms = Object.prototype.hasOwnProperty.call(req.body, 'terms_and_conditions');
        const final_terms = hasExplicitTerms
            ? adaptTermsForIssuer(sanitizeContractTermsText(terms_and_conditions), targetEmisor)
            : existing.terms_and_conditions;

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
                duration_months: durationMonths,
                discount_type: scenarioMode ? null : discount.discountType,
                discount_value: scenarioMode ? 0 : discount.discountValue,
                discount_label: scenarioMode ? null : (discount.discountLabel || null),
                discount_amount: totals.discountAmount,
                currency: targetCurrency,
                ...exchangeRateSnapshot,
                subtotal: totals.subtotal,
                tax_amount: totals.taxAmount,
                total_amount: totals.totalAmount,
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
        const { scenarioId } = req.body || {};
        const { quotation, alreadyAccepted } = await acceptQuotationBySlug({
            db: prisma,
            slug: req.params.uuid_slug,
            scenarioId
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
        const normalizedQuotation = normalizeQuotationTaxForCurrency(quotation);

        res.json({
            ...normalizedQuotation,
            consecutive_formatted: `COT-${String(quotation.consecutive).padStart(4, '0')}`,
            isExpired: quotation.status === 'ACTIVA' && new Date() > quotation.expires_at,
            profitability: calculateQuotationEconomics(quotation.items || [], {
                currency: quotation.currency,
                exchangeRate: quotation.exchange_rate,
                durationMonths: quotation.duration_months,
                discountType: quotation.discount_type,
                discountValue: quotation.discount_value
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

        const formatted = quotations.map((quotation) => {
            const normalizedQuotation = normalizeQuotationTaxForCurrency(quotation);
            return {
                ...normalizedQuotation,
                consecutive_formatted: `COT-${String(quotation.consecutive).padStart(4, '0')}`,
                isExpired: quotation.status === 'ACTIVA' && new Date() > quotation.expires_at
            };
        });

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
        const storedQuotation = await prisma.quotation.findUnique({ where: { id } });

        if (!storedQuotation) return res.status(404).json({ error: "Cotización no encontrada" });
        const quotation = normalizeQuotationTaxForCurrency(storedQuotation);

        const emisor = EMISORES_DATA[quotation.emisor_type];
        const consecutive = `COT-${String(quotation.consecutive).padStart(4, '0')}`;
        const buffer = generateQuotationPdfBuffer(quotation, emisor);

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
            where: { activo: true },
            orderBy: [{ category: 'asc' }, { name: 'asc' }]
        });
        res.json(catalog.map(serializeCatalogService));
    } catch (error) {
        console.error("[QuotationController] Catalog fetch failed:", error);
        res.status(500).json({ error: "Error al obtener el catálogo de servicios" });
    }
};
