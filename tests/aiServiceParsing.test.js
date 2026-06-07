import { describe, it, expect } from 'vitest';
import { parseJsonResponse, extractModelText } from '../src/services/aiService.js';

describe('AI Service Parsing', () => {
    it('should parse JSON from markdown code blocks', () => {
        const input = '```json\n{"categoria": "Estratégico", "complejidad": "ALTA"}\n```';
        const result = parseJsonResponse(input);
        expect(result.categoria).toBe('Estratégico');
    });

    it('should extract text from a model result object (new SDK)', () => {
        const mockResult = { text: '{"test": "ok"}' };
        expect(extractModelText(mockResult)).toBe('{"test": "ok"}');
    });

    it('should extract text from a model result object (response.text() fallback)', () => {
        const mockResult = {
            response: {
                text: () => 'fallback text'
            }
        };
        expect(extractModelText(mockResult)).toBe('fallback text');
    });
});
