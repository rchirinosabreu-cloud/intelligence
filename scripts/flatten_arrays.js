import 'dotenv/config';
import prisma from '../src/lib/prisma.js';

async function flatten() {
  console.log('🚀 INICIANDO LIMPIEZA DE ARRAYS MULTIDIMENSIONALES...');

  try {
    // 1. Verificar y aplanar en Task
    console.log('📦 1/2 Verificando y aplanando en tabla Task...');
    await prisma.$executeRaw`
      DO $$
      BEGIN
        -- Aplanar mediaUrl en Task si existe la columna
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Task' AND column_name = 'mediaUrl') THEN
          UPDATE "Task"
          SET "mediaUrl" = ARRAY(SELECT unnest("mediaUrl"))
          WHERE array_ndims("mediaUrl") > 1;
          RAISE NOTICE 'mediaUrl en Task aplanado.';
        END IF;

        -- Aplanar assetsLinks en Task si existe la columna
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Task' AND column_name = 'assetsLinks') THEN
          UPDATE "Task"
          SET "assetsLinks" = ARRAY(SELECT unnest("assetsLinks"))
          WHERE array_ndims("assetsLinks") > 1;
          RAISE NOTICE 'assetsLinks en Task aplanado.';
        END IF;
      END $$;
    `;

    // 2. Verificar y aplanar en ContentItem
    console.log('📦 2/2 Verificando y aplanando en tabla ContentItem...');
    await prisma.$executeRaw`
      DO $$
      BEGIN
        -- Aplanar mediaUrl en ContentItem
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ContentItem' AND column_name = 'mediaUrl') THEN
          UPDATE "ContentItem"
          SET "mediaUrl" = ARRAY(SELECT unnest("mediaUrl"))
          WHERE array_ndims("mediaUrl") > 1;
          RAISE NOTICE 'mediaUrl en ContentItem aplanado.';
        END IF;

        -- Aplanar assetsLinks en ContentItem
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ContentItem' AND column_name = 'assetsLinks') THEN
          UPDATE "ContentItem"
          SET "assetsLinks" = ARRAY(SELECT unnest("assetsLinks"))
          WHERE array_ndims("assetsLinks") > 1;
          RAISE NOTICE 'assetsLinks en ContentItem aplanado.';
        END IF;
      END $$;
    `;

    // 3. Verificar internalNotes en ContentPlan (P2022 fix confirmation)
    console.log('🏗️ Verificando columna internalNotes en ContentPlan...');
    await prisma.$executeRaw`ALTER TABLE "ContentPlan" ADD COLUMN IF NOT EXISTS "internalNotes" TEXT`;

    console.log('✅ PROCESO DE LIMPIEZA COMPLETADO.');

  } catch (error) {
    console.error('❌ ERROR durante la limpieza:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

flatten();
