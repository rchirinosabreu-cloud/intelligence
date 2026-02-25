import prismaPkg from '@prisma/client';

const { PrismaClient } = prismaPkg;

const globalForPrisma = globalThis;

const createPrismaClient = () => {
  if (!globalForPrisma.__brainstudioPrisma) {
    globalForPrisma.__brainstudioPrisma = new PrismaClient();
  }

  return globalForPrisma.__brainstudioPrisma;
};

export function getPrismaClient() {
  return createPrismaClient();
}

const prisma = new Proxy({}, {
  get(_target, prop) {
    return createPrismaClient()[prop];
  },
});

export { prisma, PrismaClient };
export default prisma;
