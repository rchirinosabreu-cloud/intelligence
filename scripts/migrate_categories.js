
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MASTER_CATEGORIES = [
    "Estratégico",
    "Creativo & Diseño",
    "Marketing & Social Media",
    "Producción Audiovisual",
    "Creación de Contenido",
    "Operaciones & Reuniones",
    "Administrativo & Finanzas",
    "Educación"
];

const normalizeCategory = (cat) => {
    if (!cat) return "Operaciones & Reuniones";
    const clean = cat.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

    // Mapping logic
    if (clean.includes("estrategico")) return "Estratégico";
    if (clean.includes("creativo") || clean.includes("diseno") || clean.includes("produccion visual") || clean.includes("hogar") || clean.includes("decoracion")) return "Creativo & Diseño";
    if (clean.includes("marketing") || clean.includes("social media") || clean.includes("community")) return "Marketing & Social Media";
    if (clean.includes("video") || clean.includes("audiovisual") || clean.includes("edicion")) return "Producción Audiovisual";
    if (clean.includes("contenido") || clean.includes("redaccion") || clean.includes("copy") || clean.includes("caption")) return "Creación de Contenido";
    if (clean.includes("operaciones") || clean.includes("reunion") || clean.includes("junta") || clean.includes("correccion") || clean.includes("oficina") || clean.includes("ajuste") || clean.includes("sin clasificar")) return "Operaciones & Reuniones";
    if (clean.includes("administrativo") || clean.includes("finanzas") || clean.includes("facturacion") || clean.includes("legal") || clean.includes("presupuesto")) return "Administrativo & Finanzas";
    if (clean.includes("educacion") || clean.includes("formacion") || clean.includes("capacitacion") || clean.includes("investigacion")) return "Educación";

    return "Operaciones & Reuniones";
};

async function main() {
    console.log("Starting Contingency Category Migration (Robust Normalization)...");

    const tasks = await prisma.task.findMany({
        select: { id: true, aiCategory: true }
    });

    console.log(`Analyzing ${tasks.length} tasks...`);

    let updatedCount = 0;
    for (const task of tasks) {
        const normalized = normalizeCategory(task.aiCategory);

        // Only update if the current category is NOT already the normalized one
        // Note: Strict comparison here since normalizeCategory returns from the MASTER_CATEGORIES list
        if (task.aiCategory !== normalized) {
            await prisma.task.update({
                where: { id: task.id },
                data: { aiCategory: normalized }
            });
            updatedCount++;
        }
    }

    console.log(`Contingency Migration complete. Updated ${updatedCount} tasks to 8 Master Categories.`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
