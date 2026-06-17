import prisma from '../lib/prisma.js';

/**
 * Lists all services in the catalog.
 */
export const listServices = async (req, res) => {
    try {
        const services = await prisma.serviceCatalog.findMany({
            orderBy: [{ category: 'asc' }, { name: 'asc' }]
        });

        // Strict mapping to convert Prisma Decimal to JS Number
        const serialized = services.map(service => ({
            ...service,
            valor_neto: Number(service.valor_neto),
            valor_neto_actual: Number(service.valor_neto_actual)
        }));

        res.json(serialized);
    } catch (error) {
        console.error("[ServiceController] List failed:", error);
        res.status(500).json({ error: "Error al listar servicios" });
    }
};

/**
 * Creates a new service in the catalog.
 */
const VALID_CATEGORIES = ['BRANDING', 'DISENO', 'PRODUCCION_AUDIOVISUAL', 'MARKETING', 'ADS', 'EDITORIAL', 'WEB', 'DESARROLLO'];

export const createService = async (req, res) => {
    try {
        const { category, name, description, valor_neto, valor_neto_actual } = req.body;

        if (!category || !name || !valor_neto_actual) {
            return res.status(400).json({ error: "Faltan campos obligatorios" });
        }

        if (!VALID_CATEGORIES.includes(category.toUpperCase())) {
            return res.status(400).json({ error: "Categoría inválida", details: `La categoría debe ser una de: ${VALID_CATEGORIES.join(', ')}` });
        }

        const service = await prisma.serviceCatalog.create({
            data: {
                category: category.toUpperCase(),
                name,
                description: description || "",
                valor_neto: Number(valor_neto) || Number(valor_neto_actual),
                valor_neto_actual: Number(valor_neto_actual)
            }
        });

        res.status(201).json(service);
    } catch (error) {
        console.error("[ServiceController] Create failed:", error);

        // P2002: Unique constraint failed
        if (error.code === 'P2002') {
            return res.status(400).json({
                error: "Duplicidad detectada",
                details: "Ya existe un servicio con este nombre en el catálogo."
            });
        }

        res.status(500).json({ error: "Error al crear el servicio" });
    }
};

/**
 * Updates an existing service.
 */
export const updateService = async (req, res) => {
    try {
        const { id } = req.params;
        const { category, name, description, valor_neto, valor_neto_actual } = req.body;

        if (category && !VALID_CATEGORIES.includes(category.toUpperCase())) {
            return res.status(400).json({ error: "Categoría inválida" });
        }

        const service = await prisma.serviceCatalog.update({
            where: { id },
            data: {
                category: category ? category.toUpperCase() : undefined,
                name,
                description,
                valor_neto: Number(valor_neto),
                valor_neto_actual: Number(valor_neto_actual)
            }
        });

        res.json(service);
    } catch (error) {
        console.error("[ServiceController] Update failed:", error);
        res.status(500).json({ error: "Error al actualizar el servicio" });
    }
};

/**
 * Deletes a service.
 */
export const deleteService = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.serviceCatalog.delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        console.error("[ServiceController] Delete failed:", error);
        res.status(500).json({ error: "Error al eliminar el servicio" });
    }
};
