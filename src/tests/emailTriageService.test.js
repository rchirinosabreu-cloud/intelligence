import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeModelJson, triageEmailsWithAI } from '../services/emailTriageService.js';

describe('emailTriageService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses JSON wrapped in markdown code fences', () => {
    const raw = "```json\n{\"category\":\"BASECAMP\",\"priority\":\"HIGH\",\"summary\":\"Urgent blocker\",\"shouldDisplay\":true}\n```";
    const parsed = normalizeModelJson(raw);
    expect(parsed.category).toBe('BASECAMP');
    expect(parsed.shouldDisplay).toBe(true);
  });

  it('filters out emails where shouldDisplay is false', async () => {
    const mockModel = {
      getGenerativeModel: vi.fn().mockReturnValue({
        generateContent: vi.fn()
          .mockResolvedValueOnce({ response: { text: () => JSON.stringify({ category: 'NOISE', priority: 'LOW', summary: 'Newsletter', shouldDisplay: false }) } })
          .mockResolvedValueOnce({ response: { text: () => JSON.stringify({ category: 'BASECAMP', priority: 'HIGH', summary: 'Task overdue', shouldDisplay: true }) } })
      })
    };

    const result = await triageEmailsWithAI([
      { id: '1', from: 'news@example.com', subject: 'Weekly digest', snippet: 'digest' },
      { id: '2', from: 'basecamp@example.com', subject: 'New task', snippet: 'urgent' }
    ], mockModel);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
    expect(result[0].triage.category).toBe('BASECAMP');
  });
});
