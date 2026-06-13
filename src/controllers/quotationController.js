import prisma from '../lib/prisma.js';
import crypto from 'crypto';

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
            is_tax_exempt: manual_tax_exempt
        } = req.body;

        // 1. Validation
        if (!emisor_type || !client_name || !client_phone || !items || !Array.isArray(items)) {
            return res.status(400).json({ error: "Faltan campos obligatorios" });
        }

        // 2. Generate UUID Slug and expiration (15 days)
        const uuid_slug = crypto.randomUUID();
        const created_at = new Date();
        const expires_at = new Date(created_at.getTime() + (15 * 24 * 60 * 60 * 1000));

        // 3. Automated VAT (IVA) Logic
        let is_tax_exempt = (emisor_type === 'FRANCISCO_VILLA' || client_type === 'PERSONA_NATURAL');

        // Respect manual override if provided
        if (manual_tax_exempt !== undefined) {
            is_tax_exempt = manual_tax_exempt;
        }

        // 4. Financial Calculations
        const subtotal = items.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
        const tax_amount = is_tax_exempt ? 0 : (subtotal * 0.19);
        const total_amount = subtotal + tax_amount;

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
                emisor_type,
                client_name,
                client_company: client_type === 'EMPRESA' ? client_company : null,
                client_email,
                client_phone,
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

        // Format for response if needed
        const formattedConsecutive = `COT-${String(quotation.consecutive).padStart(4, '0')}`;

        res.status(201).json({
            ...quotation,
            consecutive_formatted: formattedConsecutive
        });
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

        const emisor_data = EMISORES_DATA[quotation.emisor_type] || {};

        res.json({
            ...quotation,
            consecutive_formatted: `COT-${String(quotation.consecutive).padStart(4, '0')}`,
            emisor_data,
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

        const formatted = quotations.map(q => ({
            ...q,
            consecutive_formatted: `COT-${String(q.consecutive).padStart(4, '0')}`,
            isExpired: new Date() > q.expires_at
        }));

        res.json(formatted);
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
