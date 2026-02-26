import fs from 'node:fs';
import path from 'node:path';

const prismaFile = path.resolve(process.cwd(), 'src/lib/prisma.js');

const canonicalContent = `import prismaPkg from '@prisma/client';

const PrismaClient = prismaPkg?.PrismaClient ?? prismaPkg?.default?.PrismaClient;

if (!PrismaClient) {
  throw new Error('[Prisma] PrismaClient export not found in @prisma/client');
}

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
`;

if (!fs.existsSync(prismaFile)) {
  fs.mkdirSync(path.dirname(prismaFile), { recursive: true });
  fs.writeFileSync(prismaFile, canonicalContent, 'utf8');
  console.log('[Prisma] Created src/lib/prisma.js with ESM-safe import.');
  process.exit(0);
}

const current = fs.readFileSync(prismaFile, 'utf8');
const hasBrokenNamedImport = current.includes("import { PrismaClient } from '@prisma/client';");
const hasSafeImport = current.includes("import prismaPkg from '@prisma/client';");

if (hasBrokenNamedImport || !hasSafeImport) {
  fs.writeFileSync(prismaFile, canonicalContent, 'utf8');
  console.log('[Prisma] Rewrote src/lib/prisma.js to ESM-safe version.');
} else {
  console.log('[Prisma] src/lib/prisma.js already ESM-safe.');
}
