import prisma from '../src/lib/prisma.js';

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

async function migrate() {
    console.log("--- INICIANDO MIGRACIÓN DE CATEGORÍAS ---");
    try {
        const services = await prisma.serviceCatalog.findMany();
        console.log(`Encontrados ${services.length} servicios para procesar.`);

        for (const service of services) {
            const newCategory = CATEGORY_MAP[service.category] || service.category.toUpperCase();

            // Check if it's a valid enum value (simple check)
            const validEnums = ['BRANDING', 'DISENO', 'PRODUCCION_AUDIOVISUAL', 'MARKETING', 'ADS', 'EDITORIAL', 'WEB', 'DESARROLLO'];

            if (validEnums.includes(newCategory)) {
                await prisma.serviceCatalog.update({
                    where: { id: service.id },
                    data: { category: newCategory }
                });
                console.log(`Actualizado: ${service.name} -> ${newCategory}`);
            } else {
                console.warn(`Categoría no reconocida para ${service.name}: ${service.category}`);
            }
        }
        console.log("--- MIGRACIÓN COMPLETADA ---");
    } catch (err) {
        console.error("Fallo en migración:", err);
    } finally {
        await prisma.$disconnect();
    }
}

migrate();
