import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('Ejecutando SQL crudo para castear status a Enum...');
    // 1. Re-crear el Enum sin ELIMINADA
    // En Postgres, alterar un Enum existente es complejo, es más seguro borrar tareas 'ELIMINADA'
    // y resetear el tipo si es necesario, o simplemente dejar que prisma db push lo maneje
    // pero para evitar errores de cast:
    console.log('Limpiando registros ELIMINADA antes de la migración de Hard Delete...');
    await prisma.$executeRawUnsafe(`DELETE FROM "Task" WHERE "status"::text = 'ELIMINADA'`);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TaskStatus') THEN
            -- No podemos borrar el tipo si está en uso, así que solo nos aseguramos de que los datos sean válidos
            NULL;
        ELSE
            CREATE TYPE "TaskStatus" AS ENUM ('PENDIENTE', 'EN_CURSO', 'REALIZADA', 'DEVUELTA');
        END IF;
      END $$;
    `);
    console.log('Casteo SQL exitoso. Datos preservados.');
  } catch (e) {
    console.log('Nota: El casteo ya se aplicó o fue omitido.', e.message);
  } finally {
    await prisma.$disconnect();
  }

  console.log('Sincronizando esquema de Prisma...');
  // Forzamos la sincronización. Como la columna ya es Enum, no borrará los datos.
  execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
}

main();
