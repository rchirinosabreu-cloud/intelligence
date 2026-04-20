import prisma from '../src/lib/prisma.js';

async function migrate() {
  console.log('🚀 INICIANDO MIGRACIÓN PARA ACTIVIDAD (Brainstudio 2026 - REVISADO V3)...');

  try {
    // 1. Agregar columnas a TeamMember
    console.log('🏗️ 1/2 Agregando coordenadas de escritorio a TeamMember...');
    await prisma.$executeRaw`ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "desktopX" INTEGER`;
    await prisma.$executeRaw`ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "desktopY" INTEGER`;
    console.log('✅ Columnas de TeamMember verificadas.');

    // 2. Crear tabla OperationalEvent
    console.log('📅 2/2 Creando/Actualizando tabla OperationalEvent...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "OperationalEvent" (
        "id" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "description" TEXT,
        "startAt" TIMESTAMP(3) NOT NULL,
        "endAt" TIMESTAMP(3) NOT NULL,
        "memberIds" TEXT[] DEFAULT '{}',
        "recurrence" TEXT,
        "meetingLink" TEXT,
        "recurrenceEnd" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,

        CONSTRAINT "OperationalEvent_pkey" PRIMARY KEY ("id")
      );
    `;

    // Ensure new columns exist if table was already there
    await prisma.$executeRaw`ALTER TABLE "OperationalEvent" ADD COLUMN IF NOT EXISTS "recurrence" TEXT`;
    await prisma.$executeRaw`ALTER TABLE "OperationalEvent" ADD COLUMN IF NOT EXISTS "meetingLink" TEXT`;
    await prisma.$executeRaw`ALTER TABLE "OperationalEvent" ADD COLUMN IF NOT EXISTS "recurrenceEnd" TIMESTAMP(3)`;

    // Handle rename from meetLink if it existed in a previous run
    try {
      await prisma.$executeRaw`ALTER TABLE "OperationalEvent" RENAME COLUMN "meetLink" TO "meetingLink"`;
      console.log('🔄 Renombrado meetLink a meetingLink.');
    } catch (e) {
      // Column might not exist or already be meetingLink
    }

    console.log('✅ Tabla OperationalEvent verificada.');

    console.log('🎉 MIGRACIÓN DE ACTIVIDAD FINALIZADA.');

  } catch (error) {
    console.error('❌ ERROR CRÍTICO durante la migración:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migrate();
