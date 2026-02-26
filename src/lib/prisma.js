import { PrismaClient } from '@prisma/client';

let prisma;

// In-memory store for mock mode
const mockClients = [];
const mockLinks = []; // Store links here

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
                    _count: { files: 0, links: 0 }
                };
                mockClients.push(newClient);
                return newClient;
            },
            findUnique: async () => null
        },
        clientLink: {
            findMany: async (args) => {
                const clientId = args.where.clientId;
                return mockLinks.filter(l => l.clientId === clientId);
            },
            create: async (args) => {
                const newLink = {
                    id: 'link-id-' + Date.now(),
                    clientId: args.data.clientId,
                    title: args.data.title,
                    url: args.data.url,
                    createdAt: new Date()
                };
                mockLinks.push(newLink);
                // Update client count
                const client = mockClients.find(c => c.id === args.data.clientId);
                if (client) client._count.links = (client._count.links || 0) + 1;
                return newLink;
            },
            count: async (args) => {
                 const clientId = args.where.clientId;
                 return mockLinks.filter(l => l.clientId === clientId).length;
            },
            delete: async (args) => {
                const linkId = args.where.id;
                const index = mockLinks.findIndex(l => l.id === linkId);
                if (index !== -1) {
                     const link = mockLinks[index];
                     mockLinks.splice(index, 1);
                     // Update client count
                     const client = mockClients.find(c => c.id === link.clientId);
                     if (client && client._count.links > 0) client._count.links--;
                }
                return { id: linkId };
            }
        }
    };
}

export default prisma;
