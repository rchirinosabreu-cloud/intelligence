import { describe, it, expect } from 'vitest';
import { extractModelText } from '../services/aiService.js';

describe('aiService extractModelText', () => {
  it('extracts text when response.text is a function', () => {
    const result = { response: { text: () => '{"category":"CREATIVO","complexity":"MEDIA"}' } };
    expect(extractModelText(result)).toContain('CREATIVO');
  });

  it('extracts functionCall args as JSON when no text is present', () => {
    const result = {
      candidates: [
        { content: { parts: [{ functionCall: { args: { category: 'BOMBERO', complexity: 'ALTA' } } }] } }
      ]
    };
    expect(extractModelText(result)).toContain('BOMBERO');
  });
});
