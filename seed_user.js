import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@brainstudio.com';
  const password = 'password123';

  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    console.log(`El usuario ${email} ya existe.`);
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name: 'System Admin',
      email: email,
      password: hashedPassword,
      role: 'ADMIN'
    }
  });

  console.log(`Usuario creado exitosamente:
  Email: ${user.email}
  Contraseña: password123
  Rol: ${user.role}
  `);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
