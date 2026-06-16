import prisma from '../lib/prisma.js';
import crypto from 'crypto';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

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
            status = 'ACTIVA',
            is_tax_exempt: manual_tax_exempt
        } = req.body;

        // 1. Validation
        const isDraft = status === 'BORRADOR';
        if (!isDraft && (!emisor_type || !client_name || !client_phone || !items || !Array.isArray(items))) {
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
                emisor_type: emisor_type || 'BRAIN_STUDIO',
                status: status || 'ACTIVA',
                client_name: client_name || 'Borrador',
                client_company: client_type === 'EMPRESA' ? client_company : null,
                client_email: client_email || '',
                client_phone: client_phone || '',
                is_tax_exempt,
                items: items || [],
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
            currency = 'COP',
            status,
            is_tax_exempt: manual_tax_exempt
        } = req.body;

        const isDraft = status === 'BORRADOR';
        if (!isDraft && (!emisor_type || !client_name || !client_phone || !items || !Array.isArray(items))) {
            return res.status(400).json({ error: "Faltan campos obligatorios para emitir" });
        }

        let is_tax_exempt = (emisor_type === 'FRANCISCO_VILLA' || client_type === 'PERSONA_NATURAL');
        if (manual_tax_exempt !== undefined) is_tax_exempt = manual_tax_exempt;

        const subtotal = (items || []).reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
        const tax_amount = is_tax_exempt ? 0 : (subtotal * 0.19);
        const total_amount = subtotal + tax_amount;

        let final_terms = MANDATORY_TERMS;
        if (emisor_type === 'FRANCISCO_VILLA') {
            final_terms = final_terms.replace(/BRAIN STUDIO/gi, "El Prestador");
            final_terms = final_terms.replace(/Brain Studio/gi, "El Prestador");
        }

        const quotation = await prisma.quotation.update({
            where: { id },
            data: {
                emisor_type,
                status,
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
                terms_and_conditions: final_terms
            }
        });

        res.json({
            ...quotation,
            consecutive_formatted: `COT-${String(quotation.consecutive).padStart(4, '0')}`
        });

    } catch (error) {
        console.error("[QuotationController] Update failed:", error);
        res.status(500).json({ error: "Error al actualizar la cotización" });
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

        doc.autoTable({
            startY: 95,
            head: [['#', 'Servicio', 'Cant.', 'Precio Unit.', 'Subtotal']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillStyle: [79, 70, 229] }
        });

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
            orderBy: { category: 'asc' }
        });
        res.json(catalog);
    } catch (error) {
        console.error("[QuotationController] Catalog fetch failed:", error);
        res.status(500).json({ error: "Error al obtener el catálogo de servicios" });
    }
};
