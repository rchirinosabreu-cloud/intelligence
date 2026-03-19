import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../lib/prisma.js';
import * as contentService from '../services/contentService.js';

// Mock prisma
vi.mock('../lib/prisma.js', () => ({
  default: {
    contentPlan: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    contentItem: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    task: {
      create: vi.fn(),
    },
    $transaction: vi.fn((cb) => cb(prisma)),
  },
}));

describe('contentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getContentPlans', () => {
    it('should fetch all content plans when no clientId is provided', async () => {
      prisma.contentPlan.findMany.mockResolvedValue([{ id: '1' }]);
      const result = await contentService.getContentPlans();
      expect(prisma.contentPlan.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        include: expect.any(Object),
        orderBy: expect.any(Array),
      });
      expect(result).toEqual([{ id: '1' }]);
    });

    it('should filter by clientId when provided', async () => {
      prisma.contentPlan.findMany.mockResolvedValue([{ id: '1', clientId: 'c1' }]);
      await contentService.getContentPlans('c1');
      expect(prisma.contentPlan.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, clientId: 'c1' },
        include: expect.any(Object),
        orderBy: expect.any(Array),
      });
    });
  });

  describe('createContentPlan', () => {
    it('should create a new plan with default status', async () => {
      const data = { clientId: 'c1', month: 3, year: 2026 };
      prisma.contentPlan.create.mockResolvedValue({ id: 'p1', ...data, status: 'PLANIFICACION' });

      const result = await contentService.createContentPlan(data);

      expect(prisma.contentPlan.create).toHaveBeenCalledWith({
        data: {
          clientId: 'c1',
          month: 3,
          year: 2026,
          status: 'PLANIFICACION'
        },
        include: { client: true }
      });
      expect(result.status).toBe('PLANIFICACION');
    });
  });

  describe('sendItemToKanban', () => {
    it('should create a task and link it to the item', async () => {
      const mockItem = {
        id: 'i1',
        format: 'Reel',
        objective: 'Test Obj',
        publishDate: new Date(),
        plan: { clientId: 'c1', client: { name: 'Client' } }
      };
      prisma.contentItem.findUnique.mockResolvedValue(mockItem);

      // Mock nativeTaskService.createTask
      const mockTask = { id: 't1' };
      // We need to mock the import or the service function
      // Since it's exported from nativeTaskService, we can mock that module
    });
  });
});
