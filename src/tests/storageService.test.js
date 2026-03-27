import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../lib/prisma.js';

process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify({
  project_id: 'test-project',
  private_key: 'test-key',
});
process.env.GCS_BUCKET_NAME = 'test-bucket';

// Mock prisma
vi.mock('../lib/prisma.js', () => ({
  default: {
    client: { findUnique: vi.fn() },
    clientFile: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// Mock @google-cloud/storage
vi.mock('@google-cloud/storage', () => {
  const mFile = {
    save: vi.fn().mockResolvedValue(true),
    getSignedUrl: vi.fn().mockResolvedValue(['https://signed-url.com']),
    exists: vi.fn().mockResolvedValue([true]),
    delete: vi.fn().mockResolvedValue(true),
  };
  const mBucket = {
    file: vi.fn().mockReturnValue(mFile),
  };

  return {
    Storage: function() {
      this.bucket = () => mBucket;
    }
  };
});

describe('storageService', () => {
  let storageService;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Use a dynamic import inside beforeEach to ensure it picks up the env vars
    // AND we use the mock.
    storageService = await import('../services/storageService.js');
  });

  describe('uploadClientFile', () => {
    it('should upload a file and save metadata', async () => {
      const clientId = 'c1';
      const file = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('test content'),
        size: 1024,
      };

      prisma.client.findUnique.mockResolvedValue({ id: clientId, name: 'Test Client' });
      prisma.clientFile.create.mockResolvedValue({ id: 'f1', ...file });

      const result = await storageService.uploadClientFile(clientId, file);

      expect(prisma.client.findUnique).toHaveBeenCalledWith({
        where: { id: clientId },
        select: { name: true },
      });
      expect(prisma.clientFile.create).toHaveBeenCalledWith({
        data: {
          clientId,
          name: file.originalname,
          bucketUrl: expect.stringContaining('Test Client/'),
          category: 'Entregable',
          size: file.size,
          mimeType: file.mimetype,
        },
      });
      expect(result.id).toBe('f1');
    });

    it('should throw error if client not found', async () => {
      prisma.client.findUnique.mockResolvedValue(null);
      await expect(storageService.uploadClientFile('c1', { originalname: 'foo' })).rejects.toThrow('Client not found');
    });
  });

  describe('getClientFilesWithUrls', () => {
    it('should fetch files and generate signed URLs', async () => {
      const clientId = 'c1';
      const mockFiles = [
        { id: 'f1', bucketUrl: 'path/to/f1.pdf', name: 'f1.pdf' },
      ];
      prisma.clientFile.findMany.mockResolvedValue(mockFiles);

      const result = await storageService.getClientFilesWithUrls(clientId);

      expect(prisma.clientFile.findMany).toHaveBeenCalled();
      expect(result[0].url).toBe('https://signed-url.com');
    });
  });

  describe('deleteClientFile', () => {
    it('should delete from GCS and Prisma', async () => {
      const fileId = 'f1';
      prisma.clientFile.findUnique.mockResolvedValue({ id: fileId, bucketUrl: 'path/f1.pdf' });
      prisma.clientFile.delete.mockResolvedValue({ id: fileId });

      const result = await storageService.deleteClientFile(fileId);

      expect(prisma.clientFile.findUnique).toHaveBeenCalledWith({ where: { id: fileId } });
      expect(prisma.clientFile.delete).toHaveBeenCalledWith({ where: { id: fileId } });
      expect(result.success).toBe(true);
    });
  });
});
