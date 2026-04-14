import prisma from '../src/lib/prisma.js';
import { execSync } from 'child_process';

async function migrate() {
  console.log('🚀 INICIANDO OPERACIÓN A CORAZÓN ABIERTO (Parrilla 2.0)...');

  try {
    // 1. Sincronizar Esquema (npx prisma db push)
    console.log('🏗️ 1/3 Sincronizando esquema de base de datos (internalNotes, etc)...');
    try {
        execSync('npx prisma@6.16.1 db push --accept-data-loss', { stdio: 'inherit' });
        console.log('✅ Esquema actualizado con éxito.');
    } catch (pushErr) {
        console.error('❌ Error al empujar esquema:', pushErr.message);
        console.log('intentando vía SQL crudo como fallback...');
        await prisma.$executeRaw`ALTER TABLE "ContentPlan" ADD COLUMN IF NOT EXISTS "internalNotes" TEXT`;
        await prisma.$executeRaw`ALTER TABLE "ContentPlan" ADD COLUMN IF NOT EXISTS "shareToken" TEXT`;
        await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "ContentPlan_shareToken_key" ON "ContentPlan"("shareToken")`;
    }

    // 2. Convertir Columnas a Array (The Big Migration)
    console.log('📦 2/3 Convirtiendo columnas de Texto a Array (PostgreSQL)...');
    try {
        // SQL Nativo para casting seguro en Postgres
        await prisma.$executeRaw`ALTER TABLE "ContentItem" ALTER COLUMN "mediaUrl" TYPE TEXT[] USING array["mediaUrl"]`;
        await prisma.$executeRaw`ALTER TABLE "ContentItem" ALTER COLUMN "mediaUrl" SET DEFAULT '{}'`;
        await prisma.$executeRaw`ALTER TABLE "ContentItem" ALTER COLUMN "assetsLinks" TYPE TEXT[] USING array["assetsLinks"]`;
        await prisma.$executeRaw`ALTER TABLE "ContentItem" ALTER COLUMN "assetsLinks" SET DEFAULT '{}'`;
        console.log('✅ Columnas TEXT[] creadas exitosamente.');
    } catch (typeErr) {
        console.warn('⚠️ Nota: No se pudo alterar el tipo de columna (posiblemente ya son ARRAY o la DB no es Postgres):', typeErr.message);
    }

    // 3. Normalización de Datos
    console.log('🧹 3/3 Normalizando registros (Eliminando NULLs)...');
    const resultMedia = await prisma.$executeRaw`UPDATE "ContentItem" SET "mediaUrl" = '{}' WHERE "mediaUrl" IS NULL`;
    const resultAssets = await prisma.$executeRaw`UPDATE "ContentItem" SET "assetsLinks" = '{}' WHERE "assetsLinks" IS NULL`;

    console.log(`✅ Normalización terminada. Media: ${resultMedia}, Assets: ${resultAssets}`);
    console.log('🎉 OPERACIÓN COMPLETADA CON ÉXITO. Sistema restaurado.');

  } catch (error) {
    console.error('❌ ERROR CRÍTICO durante la migración:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

migrate();
