
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const mapping = {
    // Legacy 4
    'CREATIVO': 'Creativo & Diseño',
    'ESTRATÉGICO': 'Estratégico',
    'ADMINISTRATIVO': 'Administrativo & Finanzas',
    'BOMBERO': 'Operaciones & Reuniones',

    // Interim 12
    'Marketing': 'Marketing & Social Media',
    'Estratégico': 'Estratégico',
    'Gestión de Oficina': 'Operaciones & Reuniones',
    'Video Production': 'Producción Audiovisual',
    'Creativo': 'Creativo & Diseño',
    'Educación': 'Educación',
    'Administrativo/Operacional': 'Administrativo & Finanzas',
    'Reuniones': 'Operaciones & Reuniones',
    'Creación de Contenido': 'Creación de Contenido',
    'Corrección': 'Operaciones & Reuniones',
    'Finanzas': 'Administrativo & Finanzas',
    'Social Media': 'Marketing & Social Media',

    // ghost categories and fallbacks
    'Hogar y Decoración': 'Creativo & Diseño',
    'Sin Clasificar': 'Operaciones & Reuniones',
    'Diseño': 'Creativo & Diseño',
    'Producción': 'Creativo & Diseño',
    'null': 'Operaciones & Reuniones',
    'undefined': 'Operaciones & Reuniones'
};

async function main() {
    console.log("Starting forced category migration (Emergency Patch)...");

    const tasks = await prisma.task.findMany({
        where: {
            OR: [
                { aiCategory: { notIn: [
                    'Estratégico',
                    'Creativo & Diseño',
                    'Marketing & Social Media',
                    'Producción Audiovisual',
                    'Creación de Contenido',
                    'Operaciones & Reuniones',
                    'Administrativo & Finanzas',
                    'Educación'
                ] } },
                { aiCategory: null }
            ]
        }
    });

    console.log(`Found ${tasks.length} tasks needing re-classification.`);

    let updatedCount = 0;
    for (const task of tasks) {
        let newCategory = mapping[task.aiCategory] || 'Operaciones & Reuniones';

        // Final sanity check: if it's still not in the 8 allowed, default to Operaciones
        const allowed = [
            'Estratégico',
            'Creativo & Diseño',
            'Marketing & Social Media',
            'Producción Audiovisual',
            'Creación de Contenido',
            'Operaciones & Reuniones',
            'Administrativo & Finanzas',
            'Educación'
        ];

        if (!allowed.includes(newCategory)) {
            newCategory = 'Operaciones & Reuniones';
        }

        await prisma.task.update({
            where: { id: task.id },
            data: { aiCategory: newCategory }
        });
        updatedCount++;
    }

    console.log(`Migration complete. Updated ${updatedCount} tasks.`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
