import prisma from '../lib/prisma.js';
import crypto from 'crypto';

/**
 * Creates a new quotation with financial rules and contractual sanitization.
 */
export const createQuotation = async (req, res) => {
    try {
        const {
            emisor_type,
            client_name,
            client_email,
            client_type, // "EMPRESA" or "PERSONA_NATURAL"
            items, // Array: [{ id_servicio, nombre, descripcion, precio, cantidad }]
            currency = 'COP',
            terms_and_conditions,
            is_tax_exempt: manual_tax_exempt
        } = req.body;

        // 1. Validation
        if (!emisor_type || !client_name || !items || !Array.isArray(items)) {
            return res.status(400).json({ error: "Faltan campos obligatorios" });
        }

        // 2. Generate UUID Slug and expiration (15 days)
        const uuid_slug = crypto.randomUUID();
        const created_at = new Date();
        const expires_at = new Date(created_at.getTime() + (15 * 24 * 60 * 60 * 1000));

        // 3. Automated VAT (IVA) Logic
        // Default rule:
        // - FRANCISCO_VILLA or PERSONA_NATURAL -> Exempt
        // - BRAIN_STUDIO and EMPRESA -> 19% Tax
        let is_tax_exempt = (emisor_type === 'FRANCISCO_VILLA' || client_type === 'PERSONA_NATURAL');

        // Respect manual override if provided
        if (manual_tax_exempt !== undefined) {
            is_tax_exempt = manual_tax_exempt;
        }

        // 4. Financial Calculations
        const subtotal = items.reduce((sum, item) => sum + (Number(item.precio) * Number(item.cantidad)), 0);
        const tax_amount = is_tax_exempt ? 0 : (subtotal * 0.19);
        const total_amount = subtotal + tax_amount;

        // 5. Contractual Sanitization (Immutable T&C)
        let final_terms = terms_and_conditions || "";
        if (emisor_type === 'FRANCISCO_VILLA') {
            final_terms = final_terms.replace(/Brain Studio/gi, "El Prestador");
        }

        // 6. Persistence
        const quotation = await prisma.quotation.create({
            data: {
                uuid_slug,
                emisor_type,
                client_name,
                client_email,
                is_tax_exempt,
                items,
                currency,
                subtotal,
                tax_amount,
                total_amount,
                terms_and_conditions: final_terms,
                created_at,
                expires_at
            }
        });

        res.status(201).json(quotation);
    } catch (error) {
        console.error("[QuotationController] Create failed:", error);
        res.status(500).json({ error: "Error al crear la cotización", details: error.message });
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

        const now = new Date();
        const isExpired = now > quotation.expires_at;

        res.json({
            ...quotation,
            isExpired
        });
    } catch (error) {
        console.error("[QuotationController] Fetch public failed:", error);
        res.status(500).json({ error: "Error al obtener la cotización", details: error.message });
    }
};

/**
 * List all quotations (Admin view).
 */
export const listQuotations = async (req, res) => {
    try {
        const quotations = await prisma.quotation.findMany({
            orderBy: { created_at: 'desc' }
        });
        res.json(quotations);
    } catch (error) {
        console.error("[QuotationController] List failed:", error);
        res.status(500).json({ error: "Error al listar cotizaciones" });
    }
};

/**
 * Get the full service catalog for quotations.
 */
export const getCatalog = async (req, res) => {
    try {
        const catalog = await prisma.serviceCatalog.findMany({
            orderBy: { category: 'asc' }
        });
        res.json(catalog);
    } catch (error) {
        console.error("[QuotationController] Catalog fetch failed:", error);
        res.status(500).json({ error: "Error al obtener el catálogo de servicios" });
    }
};
