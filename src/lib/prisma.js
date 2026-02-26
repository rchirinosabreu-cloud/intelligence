// Importamos como paquete de CommonJS para evitar el bug de Node 22
import pkg from '@prisma/client';
const { PrismaClient } = pkg;

const globalForPrisma = globalThis;

// Ahora sí, instanciamos la clase correcta con los paréntesis vacíos
const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
