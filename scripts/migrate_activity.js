import prisma from '../src/lib/prisma.js';

async function migrate() {
  console.log('🚀 INICIANDO MIGRACIÓN PARA ACTIVIDAD (Brainstudio 2026)...');

  try {
    // 1. Agregar columnas a TeamMember
    console.log('🏗️ 1/2 Agregando coordenadas de escritorio a TeamMember...');
    await prisma.$executeRaw`ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "desktopX" INTEGER`;
    await prisma.$executeRaw`ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "desktopY" INTEGER`;
    console.log('✅ Columnas de TeamMember verificadas.');

    // 2. Crear tabla OperationalEvent
    console.log('📅 2/2 Creando tabla OperationalEvent si no existe...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "OperationalEvent" (
        "id" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "description" TEXT,
        "startAt" TIMESTAMP(3) NOT NULL,
        "endAt" TIMESTAMP(3) NOT NULL,
        "memberIds" TEXT[] DEFAULT '{}',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,

        CONSTRAINT "OperationalEvent_pkey" PRIMARY KEY ("id")
      );
    `;
    console.log('✅ Tabla OperationalEvent verificada.');

    console.log('🎉 MIGRACIÓN DE ACTIVIDAD FINALIZADA.');

  } catch (error) {
    console.error('❌ ERROR CRÍTICO durante la migración:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

migrate();
