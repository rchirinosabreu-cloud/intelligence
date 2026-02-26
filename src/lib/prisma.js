import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

let prisma;

// In-memory store for mock mode
const mockClients = [];
const mockLinks = []; // Store links here
const mockTasks = []; // Store tasks here

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
    // Never crash the entire API because DB is temporarily unavailable/misconfigured.
    // Endpoints that do not depend on DB should continue serving traffic.
    console.error("CRITICAL: Failed to initialize PrismaClient in production. Falling back to in-memory mock.", e);
  } else {
    console.error("Failed to initialize PrismaClient locally. Using mock.", e);
  }
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
                    _count: { files: 0, links: 0, tasks: 0 }
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
        },
        clientTask: {
            findMany: async (args) => {
                const clientId = args.where?.clientId;
                if (!clientId) return [];
                return mockTasks
                    .filter(t => t.clientId === clientId)
                    .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
            },
            create: async (args) => {
                const newTask = {
                    id: 'task-id-' + Date.now(),
                    ...args.data,
                    createdAt: new Date(),
                    completed: args.data.completed || false
                };
                mockTasks.push(newTask);
                return newTask;
            },
            update: async (args) => {
                const taskId = args.where.id;
                const index = mockTasks.findIndex(t => t.id === taskId);
                if (index === -1) throw { code: 'P2025' };

                const updatedTask = { ...mockTasks[index], ...args.data };
                mockTasks[index] = updatedTask;
                return updatedTask;
            },
            delete: async (args) => {
                const taskId = args.where.id;
                const index = mockTasks.findIndex(t => t.id === taskId);
                if (index === -1) throw { code: 'P2025' };

                mockTasks.splice(index, 1);
                return { id: taskId };
            }
        }
    };
}

export default prisma;
