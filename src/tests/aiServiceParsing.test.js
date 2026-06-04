import { describe, it, expect } from 'vitest';
import { extractModelText } from '../services/aiService.js';

describe('aiService extractModelText', () => {
  it('extracts text when response.text is a function', () => {
    const result = { response: { text: () => '{"category":"Creativo","complexity":"MEDIA"}' } };
    expect(extractModelText(result)).toContain('Creativo');
  });

  it('extracts functionCall args as JSON when no text is present', () => {
    const result = {
      candidates: [
        { content: { parts: [{ functionCall: { args: { category: 'Marketing', complexity: 'ALTA' } } }] } }
      ]
    };
    expect(extractModelText(result)).toContain('Marketing');
  });
});
