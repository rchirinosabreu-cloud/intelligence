import prisma from '../lib/prisma.js';
import { serializeCatalogService } from '../services/quotationDomainService.js';
import { resolveCatalogDescriptionInput } from '../services/serviceCatalogDescription.js';
import { bogotaToday } from '../lib/debtAging.js';
import { buildCatalogWorkbook, readCatalogWorkbook, planCatalogImport, catalogChangeData } from '../services/serviceCatalogSpreadsheet.js';

const parseMoneyField = (value, label, { required = true } = {}) => {
    if (!required && (value === undefined || value === null || value === '')) return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        const error = new Error(`${label} debe ser un valor mayor o igual a cero`);
        error.statusCode = 400;
        throw error;
    }
    return parsed;
};

/**
 * Lists all services in the catalog.
 */
export const listServices = async (req, res) => {
    try {
        const services = await prisma.serviceCatalog.findMany({
            where: { activo: true },
            orderBy: [{ category: 'asc' }, { name: 'asc' }]
        });

        // Strict mapping to convert Prisma Decimal to JS Number
        const serialized = services.map(serializeCatalogService);

        res.json(serialized);
    } catch (error) {
        console.error("[ServiceController] List failed:", error);
        res.status(500).json({ error: "Error al listar servicios" });
    }
};

/**
 * Creates a new service in the catalog.
 */
const VALID_CATEGORIES = ['BRANDING', 'DISENO', 'COMUNICACION_CORPORATIVA', 'PRODUCCION_AUDIOVISUAL', 'MARKETING', 'ADS', 'EDITORIAL', 'WEB', 'DESARROLLO', 'MERCHANDISING_IMPRESION'];

export const createService = async (req, res) => {
    try {
        const { category, name, description, descriptionHtml, costo_real_estimado, valor_neto, valor_neto_actual, precio_comercial_sugerido, precio_variable } = req.body;

        if (!category || !String(name).trim()) {
            return res.status(400).json({ error: "Faltan campos obligatorios" });
        }

        if (!VALID_CATEGORIES.includes(category.toUpperCase())) {
            return res.status(400).json({ error: "Categoría inválida", details: `La categoría debe ser una de: ${VALID_CATEGORIES.join(', ')}` });
        }

        const estimatedCost = parseMoneyField(costo_real_estimado, 'El costo real estimado');
        const finalPrice = parseMoneyField(valor_neto, 'El precio final');
        const currentPrice = parseMoneyField(valor_neto_actual, 'El precio actual');

        const service = await prisma.serviceCatalog.create({
            data: {
                category: category.toUpperCase(),
                name: String(name).trim(),
                ...resolveCatalogDescriptionInput({ description: description ?? '', descriptionHtml }),
                costo_real_estimado: estimatedCost,
                valor_neto: finalPrice,
                valor_neto_actual: currentPrice,
                precio_comercial_sugerido: parseMoneyField(precio_comercial_sugerido, 'El precio comercial sugerido', { required: false }),
                precio_variable: Boolean(precio_variable),
                activo: true
            }
        });

        res.status(201).json(serializeCatalogService(service));
    } catch (error) {
        console.error("[ServiceController] Create failed:", error);

        // P2002: Unique constraint failed
        if (error.code === 'P2002') {
            return res.status(400).json({
                error: "Duplicidad detectada",
                details: "Ya existe un servicio con este nombre en el catálogo."
            });
        }

        res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : "Error al crear el servicio" });
    }
};

/**
 * Updates an existing service.
 */
export const updateService = async (req, res) => {
    try {
        const { id } = req.params;
        const { category, name, description, descriptionHtml, costo_real_estimado, valor_neto, valor_neto_actual, precio_comercial_sugerido, precio_variable } = req.body;

        if (category && !VALID_CATEGORIES.includes(category.toUpperCase())) {
            return res.status(400).json({ error: "Categoría inválida" });
        }

        const service = await prisma.serviceCatalog.update({
            where: { id },
            data: {
                category: category ? category.toUpperCase() : undefined,
                name: name === undefined ? undefined : String(name).trim(),
                ...resolveCatalogDescriptionInput({ description, descriptionHtml }),
                costo_real_estimado: parseMoneyField(costo_real_estimado, 'El costo real estimado', { required: false }),
                valor_neto: parseMoneyField(valor_neto, 'El precio final', { required: false }),
                valor_neto_actual: parseMoneyField(valor_neto_actual, 'El precio actual', { required: false }),
                precio_comercial_sugerido: parseMoneyField(precio_comercial_sugerido, 'El precio comercial sugerido', { required: false }),
                precio_variable: precio_variable === undefined ? undefined : Boolean(precio_variable)
            }
        });

        res.json(serializeCatalogService(service));
    } catch (error) {
        console.error("[ServiceController] Update failed:", error);
        res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : "Error al actualizar el servicio" });
    }
};

/**
 * Deletes a service.
 */
export const deleteService = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.serviceCatalog.update({ where: { id }, data: { activo: false } });
        res.json({ success: true });
    } catch (error) {
        console.error("[ServiceController] Delete failed:", error);
        res.status(500).json({ error: "Error al eliminar el servicio" });
    }
};

// El catálogo en Excel (Elisa y Rodny, 20 de noviembre de 2026): descargar, corregir y volver a subir.
// Subir primero muestra lo que cambiaría (`preview`) y solo guarda al confirmar con la misma huella del catálogo.


export const exportCatalog = async (req, res) => {
    try {
        const services = await prisma.serviceCatalog.findMany({ where: { activo: true } });
        const buffer = buildCatalogWorkbook(services);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="catalogo-de-servicios-${bogotaToday()}.xlsx"`);
        res.send(buffer);
    } catch (error) {
        console.error('[ServiceController] Export failed:', error);
        res.status(500).json({ error: 'No se pudo preparar el Excel del catálogo' });
    }
};

const planFromUpload = async (client, file) => {
    if (!file?.buffer?.length) throw Object.assign(new Error('Adjunta el archivo de Excel del catálogo.'), { statusCode: 400 });
    const rows = readCatalogWorkbook(file.buffer);
    const services = await client.serviceCatalog.findMany();
    return planCatalogImport(services, rows);
};

export const previewCatalogImport = async (req, res) => {
    try {
        res.json(await planFromUpload(prisma, req.file));
    } catch (error) {
        if (!error.statusCode) console.error('[ServiceController] Import preview failed:', error);
        res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'No se pudo revisar el archivo' });
    }
};

export const applyCatalogImport = async (req, res) => {
    try {
        const result = await prisma.$transaction(async tx => {
            const plan = await planFromUpload(tx, req.file);
            if (plan.revision !== req.body?.expectedRevision) throw Object.assign(new Error('El catálogo cambió mientras revisabas el archivo. Súbelo otra vez para ver los cambios actuales.'), { statusCode: 409 });
            if (plan.errors.length) throw Object.assign(new Error('El archivo tiene filas por corregir. Corrígelas y súbelo otra vez.'), { statusCode: 400 });
            for (const change of plan.changes) {
                const data = catalogChangeData(change);
                if (change.kind === 'UPDATE') await tx.serviceCatalog.update({ where: { id: change.id }, data });
                else await tx.serviceCatalog.create({ data });
            }
            return plan.counts;
        }, { isolationLevel: 'Serializable', timeout: 60_000 });
        res.json({ updated: result.updates, created: result.creates });
    } catch (error) {
        if (error.code === 'P2002') return res.status(400).json({ error: 'Dos servicios quedarían con el mismo nombre. Revisa los nombres del archivo.' });
        if (error.code === 'P2034') return res.status(409).json({ error: 'El catálogo cambió mientras se guardaba. Súbelo otra vez.' });
        if (!error.statusCode) console.error('[ServiceController] Import failed:', error);
        res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'No se pudo guardar el catálogo' });
    }
};
