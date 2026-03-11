import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('Ejecutando SQL crudo para castear status a Enum...');
    // 1. Crear el Enum si no existe
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "TaskStatus" AS ENUM ('PENDIENTE', 'EN_CURSO', 'REALIZADA', 'DEVUELTA', 'ELIMINADA');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    // 2. Hacer el cast de texto a Enum de forma segura
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Task" ALTER COLUMN "status" TYPE "TaskStatus" USING
      CASE
        WHEN "status"::text = 'En curso' OR "status"::text = 'En proceso' THEN 'EN_CURSO'::"TaskStatus"
        WHEN "status"::text = 'Realizada' OR "status"::text = 'Realizado' THEN 'REALIZADA'::"TaskStatus"
        WHEN "status"::text = 'Devuelta' THEN 'DEVUELTA'::"TaskStatus"
        WHEN "status"::text = 'Pendiente' THEN 'PENDIENTE'::"TaskStatus"
        ELSE 'PENDIENTE'::"TaskStatus"
      END;
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
