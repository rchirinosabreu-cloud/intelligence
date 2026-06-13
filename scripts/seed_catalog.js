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

            servicesToInsert.push({
                category: currentCategory,
                name: nombreServicio.replace(/^"|"$/g, ''),
                description: descripcion.replace(/^"|"$/g, ''),
                valor_neto: cleanNumber(valorNeto),
                valor_neto_actual: cleanNumber(valorNetoActual)
            });
        }

        console.log(`Limpiando tabla ServiceCatalog...`);
        await prisma.serviceCatalog.deleteMany({});

        console.log(`Insertando ${servicesToInsert.length} servicios...`);

        // We use createMany if supported, otherwise loop (Decimal type needs special care in some versions)
        // Since we are using Prisma 6.x, createMany is standard.
        await prisma.serviceCatalog.createMany({
            data: servicesToInsert
        });

        console.log("--- SEEDING COMPLETADO EXITOSAMENTE ---");

    } catch (err) {
        console.error("Fallo crítico durante el seeding:", err);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

seedCatalog();
