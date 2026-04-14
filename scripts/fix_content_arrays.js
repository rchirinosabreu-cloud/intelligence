import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function migrate() {
  console.log('🚀 Iniciando migración de EMERGENCIA para ContentItem (Strings -> Arrays)...');

  try {
    // Intentamos agregar las columnas faltantes si npx prisma db push no se ha ejecutado
    console.log('🏗️ Verificando esquema de la base de datos...');
    try {
        await prisma.$executeRaw`ALTER TABLE "ContentPlan" ADD COLUMN IF NOT EXISTS "internalNotes" TEXT`;
        await prisma.$executeRaw`ALTER TABLE "ContentPlan" ADD COLUMN IF NOT EXISTS "shareToken" TEXT`;
        await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "ContentPlan_shareToken_key" ON "ContentPlan"("shareToken")`;
        console.log('✅ Columnas de ContentPlan verificadas.');
    } catch (e) {
        console.warn('⚠️ No se pudieron verificar columnas de ContentPlan (posiblemente ya existen):', e.message);
    }

    // Convertir columnas a tipo Array si son String
    try {
        // En Postgres, cambiar de TEXT a TEXT[] requiere una conversión explícita
        await prisma.$executeRaw`ALTER TABLE "ContentItem" ALTER COLUMN "mediaUrl" TYPE TEXT[] USING array["mediaUrl"]`;
        await prisma.$executeRaw`ALTER TABLE "ContentItem" ALTER COLUMN "mediaUrl" SET DEFAULT '{}'`;
        await prisma.$executeRaw`ALTER TABLE "ContentItem" ALTER COLUMN "assetsLinks" TYPE TEXT[] USING array["assetsLinks"]`;
        await prisma.$executeRaw`ALTER TABLE "ContentItem" ALTER COLUMN "assetsLinks" SET DEFAULT '{}'`;
        console.log('✅ Tipos de columna en ContentItem actualizados a ARRAY.');
    } catch (e) {
        console.warn('⚠️ No se pudo cambiar el tipo de columna (posiblemente ya son ARRAY):', e.message);
    }

    // Limpieza de NULLs por si acaso
    await prisma.$executeRaw`UPDATE "ContentItem" SET "mediaUrl" = '{}' WHERE "mediaUrl" IS NULL`;
    await prisma.$executeRaw`UPDATE "ContentItem" SET "assetsLinks" = '{}' WHERE "assetsLinks" IS NULL`;

    console.log('🎉 Migración completada con éxito.');
  } catch (error) {
    console.error('❌ Error CRÍTICO durante la migración:', error);
  } finally {
    await prisma.$disconnect();
  }
}

migrate();
