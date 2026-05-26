import { describe, it, expect } from 'vitest';
import { normalizeModelJson, extractTriagePayload } from '../services/emailTriageService.js';

describe('email triage payload extraction', () => {
  it('reads text from nested response candidates', () => {
    const raw = {
      response: {
        candidates: [
          { content: { parts: [{ text: '{"category":"BASECAMP","priority":"HIGH","summary":"x","shouldDisplay":true}' }] } }
        ]
      }
    };
    const text = extractTriagePayload(raw);
    const parsed = normalizeModelJson(text);
    expect(parsed.category).toBe('BASECAMP');
  });
});
