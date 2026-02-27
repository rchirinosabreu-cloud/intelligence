import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const isProduction = process.env.NODE_ENV === 'production';

// In-memory store for mock mode
const mockClients = [];
const mockLinks = [];
const mockTasks = [];

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim());
const hasAccelerateUrl = Boolean(process.env.PRISMA_ACCELERATE_URL && String(process.env.PRISMA_ACCELERATE_URL).trim());
const shouldUseMockDb =
  !isProduction &&
  (process.env.USE_MOCK_DB === 'true' || (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('dummy')));

let prismaInstance = null;
let prismaInitAttempted = false;
let prismaInitError = null;

const createUnavailableError = (modelName, operation) => {
  if (prismaInitError) {
    return new Error(`DB_UNAVAILABLE:${modelName}.${operation} - ${prismaInitError.message}`);
  }

  return new Error(`DB_UNAVAILABLE:${modelName}.${operation}`);
};

const getPrisma = () => {
  if (prismaInstance) return prismaInstance;
  if (prismaInitAttempted) return null;

  prismaInitAttempted = true;

  if (!hasDatabaseUrl && !hasAccelerateUrl) {
    prismaInitError = new Error('DATABASE_URL/PRISMA_ACCELERATE_URL missing.');
    console.error('[Prisma] DATABASE_URL/PRISMA_ACCELERATE_URL missing. Database-backed endpoints will return errors.');
    return null;
  }

  try {
    const { PrismaClient } = require('@prisma/client');

    if (hasAccelerateUrl) {
      prismaInstance = new PrismaClient({ accelerateUrl: process.env.PRISMA_ACCELERATE_URL });
      return prismaInstance;
    }

    const { PrismaPg } = require('@prisma/adapter-pg');
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    prismaInstance = new PrismaClient({ adapter });
    return prismaInstance;
  } catch (error) {
    prismaInitError = error;
    const where = isProduction ? 'production' : 'local';
    console.error(`[Prisma] Failed to initialize PrismaClient in ${where}. Database-backed endpoints will return errors.`, error);
    return null;
  }
};

const createLazyUnavailableModel = (modelName) => ({
  findMany: async (...args) => {
    const prisma = getPrisma();
    if (!prisma?.[modelName]?.findMany) throw createUnavailableError(modelName, 'findMany');
    return prisma[modelName].findMany(...args);
  },
  create: async (...args) => {
    const prisma = getPrisma();
    if (!prisma?.[modelName]?.create) throw createUnavailableError(modelName, 'create');
    return prisma[modelName].create(...args);
  },
  findUnique: async (...args) => {
    const prisma = getPrisma();
    if (!prisma?.[modelName]?.findUnique) throw createUnavailableError(modelName, 'findUnique');
    return prisma[modelName].findUnique(...args);
  },
  count: async (...args) => {
    const prisma = getPrisma();
    if (!prisma?.[modelName]?.count) throw createUnavailableError(modelName, 'count');
    return prisma[modelName].count(...args);
  },
  delete: async (...args) => {
    const prisma = getPrisma();
    if (!prisma?.[modelName]?.delete) throw createUnavailableError(modelName, 'delete');
    return prisma[modelName].delete(...args);
  },
  update: async (...args) => {
    const prisma = getPrisma();
    if (!prisma?.[modelName]?.update) throw createUnavailableError(modelName, 'update');
    return prisma[modelName].update(...args);
  },
});

const createMockPrisma = () => ({
  client: {
    findMany: async () => [...mockClients].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
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
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
});

const prisma = shouldUseMockDb
  ? (console.warn('Using In-Memory Mock Prisma Client (Fallback)'), createMockPrisma())
  : {
      client: createLazyUnavailableModel('client'),
      clientLink: createLazyUnavailableModel('clientLink'),
      clientTask: createLazyUnavailableModel('clientTask'),
    };

export default prisma;
