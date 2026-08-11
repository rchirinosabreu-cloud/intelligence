import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from '../src/lib/prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Seeder script for ServiceCatalog from CSV
 */
async function seedCatalog() {
    console.log("--- INICIANDO SEEDING DE TARIFARIO 2026 ---");

    const csvPath = path.join(__dirname, '../data/tarifario_2026.csv');

    if (!fs.existsSync(csvPath)) {
        console.error(`ERROR: Archivo no encontrado en ${csvPath}`);
        process.exit(1);
    }

    try {
        const fileContent = fs.readFileSync(csvPath, 'utf8');
        const lines = fileContent.split('\n');

        // Omitir las primeras 3 filas de metadatos (índices 0, 1, 2)
        // La fila 4 (índice 3) contiene los headers
        // Las filas de datos comienzan en el índice 4
        const dataLines = lines.slice(4);

        const servicesToInsert = [];
        let currentCategory = "";

        for (const line of dataLines) {
            if (!line.trim()) continue;

            // Simple split by comma, but handle quoted strings
            // Using a regex to handle commas inside quotes
            const parts = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];

            // Re-evaluating parts if regex fails or behaves unexpectedly with empty leading columns
            const rawParts = [];
            let inQuotes = false;
            let currentPart = "";

            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    rawParts.push(currentPart.trim());
                    currentPart = "";
                } else {
                    currentPart += char;
                }
            }
            rawParts.push(currentPart.trim());

            if (rawParts.length < 10) continue;

            let [
                tipoServicio,
                nombreServicio,
                descripcion,
                costoReal,
                valorNeto,
                iva,
                valorConIva,
                descuento,
                valorConDescuento,
                valorNetoActual
            ] = rawParts;

            // Persistence of category if empty in current row
            if (tipoServicio) {
                currentCategory = tipoServicio;
            }

            if (!nombreServicio || nombreServicio === "Nombre del servicio") continue;

            // Clean numerical fields: remove $, dots, and handle decimals if any
            const cleanNumber = (val) => {
                if (!val) return "0";
                // Remove $, dots (thousands separator in some locales), and trim
                let cleaned = val.replace(/[$\.]/g, '').trim();
                // Replace comma with dot for decimal if present (standardizing to dot)
                cleaned = cleaned.replace(',', '.');
                return cleaned || "0";
            };

            const CATEGORY_MAP = {
                'Branding': 'BRANDING',
                'Diseño': 'DISENO',
                'Producción audiovisual': 'PRODUCCION_AUDIOVISUAL',
                'Marketing': 'MARKETING',
                'Ads': 'ADS',
                'Editorial': 'EDITORIAL',
                'Web': 'WEB',
                'Desarrollo web y tecnología': 'DESARROLLO'
            };

            servicesToInsert.push({
                category: CATEGORY_MAP[currentCategory] || 'WEB',
                name: nombreServicio.replace(/^"|"$/g, ''),
                description: descripcion.replace(/^"|"$/g, ''),
                costo_real_estimado: cleanNumber(costoReal),
                valor_neto: cleanNumber(valorNeto),
                valor_neto_actual: cleanNumber(valorNetoActual)
            });
        }

        // --- PRE-CLEANUP FOR UNIQUENESS ---
        // Identify and remove duplicates based on name to allow index creation
        console.log("Revisando integridad de unicidad en ServiceCatalog...");
        const allExisting = await prisma.serviceCatalog.findMany({ select: { id: true, name: true } });
        const nameMap = new Map();
        const duplicates = [];

        for (const s of allExisting) {
            if (nameMap.has(s.name)) {
                duplicates.push(s.id);
            } else {
                nameMap.set(s.name, s.id);
            }
        }

        if (duplicates.length > 0) {
            console.log(`Eliminando ${duplicates.length} registros duplicados para asegurar restricción única...`);
            await prisma.serviceCatalog.deleteMany({
                where: { id: { in: duplicates } }
            });
        }

        console.log(`Upserteando ${servicesToInsert.length} servicios...`);

        for (const service of servicesToInsert) {
            // Defensive approach: check if exists first to avoid PrismaClientValidationError
            // if @unique were somehow missing or not recognized.
            const existing = await prisma.serviceCatalog.findUnique({
                where: { name: service.name }
            });

            if (existing) {
                await prisma.serviceCatalog.update({
                    where: { id: existing.id },
                    data: {
                        category: service.category,
                        description: service.description,
                        costo_real_estimado: service.costo_real_estimado,
                        valor_neto: service.valor_neto,
                        valor_neto_actual: service.valor_neto_actual
                    }
                });
            } else {
                await prisma.serviceCatalog.create({
                    data: service
                });
            }
        }

        console.log("--- SEEDING COMPLETADO EXITOSAMENTE ---");

    } catch (err) {
        console.error("Fallo crítico durante el seeding:", err);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

seedCatalog();
