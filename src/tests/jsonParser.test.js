import { describe, it, expect } from 'vitest';
import { parseJsonFromAiResponse } from '../utils/jsonParser';

describe('parseJsonFromAiResponse', () => {
    it('should parse valid JSON directly', () => {
        const input = '{"key": "value"}';
        const result = parseJsonFromAiResponse(input);
        expect(result).toEqual({ key: 'value' });
    });

    it('should strip markdown code blocks and parse JSON', () => {
        const input = '```json\n{"key": "value"}\n```';
        const result = parseJsonFromAiResponse(input);
        expect(result).toEqual({ key: 'value' });
    });

    it('should strip markdown code blocks with extra text around it', () => {
        const input = 'Here is the JSON:\n```json\n{"key": "value"}\n```\nHope this helps!';
        const result = parseJsonFromAiResponse(input);
        expect(result).toEqual({ key: 'value' });
    });

    it('should strip markdown code blocks without json specifier', () => {
        const input = '```\n{"key": "value"}\n```';
        const result = parseJsonFromAiResponse(input);
        expect(result).toEqual({ key: 'value' });
    });

    it('should throw an error if the JSON is invalid after stripping', () => {
        const input = '```json\n{"key": "value"\n```';
        expect(() => parseJsonFromAiResponse(input)).toThrow(SyntaxError);
    });
});
