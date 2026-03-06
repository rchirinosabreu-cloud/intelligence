import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function syncUsers() {
  console.log("=== Iniciando sincronización de TeamMembers a Users ===");

  try {
    // 1. Obtener todos los TeamMembers activos que tengan un email configurado
    const teamMembers = await prisma.teamMember.findMany({
      where: {
        isActive: true,
        email: { not: null, not: '' }
      }
    });

    if (teamMembers.length === 0) {
      console.log("No se encontraron TeamMembers con email para sincronizar.");
      return;
    }

    console.log(`Se encontraron ${teamMembers.length} miembros con email.`);

    const defaultPassword = 'Brainstudio2026';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    let createdCount = 0;
    let skippedCount = 0;

    for (const member of teamMembers) {
      const normalizedEmail = member.email.trim().toLowerCase();

      // 2. Verificar si el usuario ya existe en la tabla User
      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail }
      });

      if (existingUser) {
        console.log(`[SKIPPED] El usuario ${normalizedEmail} ya existe.`);
        skippedCount++;
        continue;
      }

      // 3. Crear la cuenta de usuario para el TeamMember
      await prisma.user.create({
        data: {
          name: member.name,
          email: normalizedEmail,
          password: hashedPassword,
          role: 'EDITOR' // Default role
        }
      });

      console.log(`[CREATED] Usuario creado para ${member.name} (${normalizedEmail})`);
      createdCount++;
    }

    console.log("=== Sincronización Completada ===");
    console.log(`Nuevos usuarios creados: ${createdCount}`);
    console.log(`Usuarios omitidos (ya existían): ${skippedCount}`);

  } catch (error) {
    console.error("Error durante la sincronización:", error);
  } finally {
    await prisma.$disconnect();
  }
}

syncUsers();
