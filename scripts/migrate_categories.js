
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
    'Social Media': 'Marketing & Social Media'
};

async function main() {
    console.log("Starting category migration...");

    const tasks = await prisma.task.findMany({
        where: {
            aiCategory: { not: null }
        }
    });

    console.log(`Found ${tasks.length} tasks with categories.`);

    let updatedCount = 0;
    for (const task of tasks) {
        const newCategory = mapping[task.aiCategory];
        if (newCategory && newCategory !== task.aiCategory) {
            await prisma.task.update({
                where: { id: task.id },
                data: { aiCategory: newCategory }
            });
            updatedCount++;
        }
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
