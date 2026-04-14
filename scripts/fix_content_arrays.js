import prisma from '../src/lib/prisma.js';

async function migrate() {
  console.log('🚀 INICIANDO MIGRACIÓN DE ROBUSTEZ (Parrilla 2.0)...');

  try {
    // 1. Crear columnas nuevas si no existen
    console.log('🏗️ 1/3 Creando columnas de notas internas...');
    await prisma.$executeRaw`ALTER TABLE "ContentPlan" ADD COLUMN IF NOT EXISTS "internalNotes" TEXT`;
    await prisma.$executeRaw`ALTER TABLE "ContentPlan" ADD COLUMN IF NOT EXISTS "shareToken" TEXT`;
    await prisma.$executeRaw`ALTER TABLE "ContentItem" ADD COLUMN IF NOT EXISTS "internalNotes" TEXT`;
    await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "ContentPlan_shareToken_key" ON "ContentPlan"("shareToken")`;
    console.log('✅ Columnas base verificadas.');

    // 2. Conversión inteligente de TEXT a TEXT[] y limpieza de dimensiones
    // Usamos un bloque DO para lógica compleja en PostgreSQL
    console.log('📦 2/3 Corrigiendo dimensiones de array en ContentItem...');

    await prisma.$executeRaw`
      DO $$
      BEGIN
        -- Corregir mediaUrl
        IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'ContentItem' AND column_name = 'mediaUrl') = 'text' THEN
          ALTER TABLE "ContentItem" ALTER COLUMN "mediaUrl" TYPE TEXT[] USING ARRAY["mediaUrl"];
        END IF;

        -- Si por error se crearon arrays anidados (dimensiones > 1), los aplanamos
        UPDATE "ContentItem"
        SET "mediaUrl" = "mediaUrl"[1]
        WHERE array_ndims("mediaUrl") > 1;

        -- Corregir assetsLinks
        IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'ContentItem' AND column_name = 'assetsLinks') = 'text' THEN
          ALTER TABLE "ContentItem" ALTER COLUMN "assetsLinks" TYPE TEXT[] USING ARRAY["assetsLinks"];
        END IF;

        UPDATE "ContentItem"
        SET "assetsLinks" = "assetsLinks"[1]
        WHERE array_ndims("assetsLinks") > 1;

        -- Defaults
        ALTER TABLE "ContentItem" ALTER COLUMN "mediaUrl" SET DEFAULT '{}';
        ALTER TABLE "ContentItem" ALTER COLUMN "assetsLinks" SET DEFAULT '{}';
      END $$;
    `;
    console.log('✅ Conversión de tipos y dimensiones completada.');

    // 3. Normalización final (Eliminar NULLs)
    console.log('🧹 3/3 Limpiando registros NULL...');
    await prisma.$executeRaw`UPDATE "ContentItem" SET "mediaUrl" = '{}' WHERE "mediaUrl" IS NULL`;
    await prisma.$executeRaw`UPDATE "ContentItem" SET "assetsLinks" = '{}' WHERE "assetsLinks" IS NULL`;

    console.log('🎉 MIGRACIÓN DE ROBUSTEZ FINALIZADA.');

  } catch (error) {
    console.error('❌ ERROR CRÍTICO durante la migración:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

migrate();
