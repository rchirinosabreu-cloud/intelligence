import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as feedbackService from '../services/feedbackService';
import prisma from '../lib/prisma';

vi.mock('../lib/prisma', () => ({
  default: {
    feedbackRecord: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

describe('feedbackService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getFeedbackForCollaborator should filter privateNote for non-admins', async () => {
    const mockData = [
      { id: '1', collaboratorId: 'user1', privateNote: 'secret' },
    ];
    prisma.feedbackRecord.findMany.mockResolvedValue(mockData);

    const result = await feedbackService.getFeedbackForCollaborator('user1', false);

    expect(result[0].privateNote).toBeUndefined();
  });

  it('getFeedbackForCollaborator should include privateNote for ADMINs', async () => {
    const mockData = [
      { id: '1', collaboratorId: 'user1', privateNote: 'secret' },
    ];
    prisma.feedbackRecord.findMany.mockResolvedValue(mockData);

    const result = await feedbackService.getFeedbackForCollaborator('user1', true);

    expect(result[0].privateNote).toBe('secret');
  });

  it('createFeedbackRecord should call prisma.create', async () => {
    const data = { collaboratorId: 'u1', authorId: 'a1', type: 'ESCRITO', strengths: 'good' };
    prisma.feedbackRecord.create.mockResolvedValue({ ...data, id: 'f1' });

    const result = await feedbackService.createFeedbackRecord(data);

    expect(prisma.feedbackRecord.create).toHaveBeenCalled();
    expect(result.id).toBe('f1');
  });
});
