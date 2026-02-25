import { PrismaClient } from '@prisma/client';

let prisma;

// In-memory store for mock mode
const mockClients = [];

try {
  if (process.env.NODE_ENV === 'production') {
    prisma = new PrismaClient();
  } else {
    if (!global.prisma) {
      global.prisma = new PrismaClient();
    }
    prisma = global.prisma;
  }
} catch (e) {
  if (process.env.NODE_ENV === 'production') {
      console.error("CRITICAL: Failed to initialize PrismaClient in production.", e);
      throw e;
  }
  console.error("Failed to initialize PrismaClient locally. Using mock.", e);
}

// Explicit override for testing environments or when DB is missing locally
if (!prisma || (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('dummy'))) {
    console.warn("Using In-Memory Mock Prisma Client (Fallback)");
    prisma = {
        client: {
            findMany: async () => [...mockClients].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)),
            create: async (args) => {
                const newClient = {
                    id: 'mock-id-' + Date.now(),
                    name: args.data.name,
                    slug: args.data.slug,
                    status: 'active',
                    logoUrl: args.data.logoUrl,
                    createdAt: new Date(),
                    _count: { files: 0 }
                };
                mockClients.push(newClient);
                return newClient;
            },
            findUnique: async () => null
        }
    };
}

export default prisma;
