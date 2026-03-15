import { describe, it, expect, vi } from 'vitest';
import { encrypt, decrypt } from '../utils/encryption.js';

describe('Encryption Utility', () => {
    // 32 chars key
    process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';

    it('should encrypt and decrypt text correctly', () => {
        const secret = 'super-secret-meta-token';
        const encrypted = encrypt(secret);

        expect(encrypted).toContain(':');

        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(secret);
    });

    it('should produce different IVs for same text', () => {
        const secret = 'same-text';
        const encrypted1 = encrypt(secret);
        const encrypted2 = encrypt(secret);

        expect(encrypted1).not.toBe(encrypted2);

        expect(decrypt(encrypted1)).toBe(secret);
        expect(decrypt(encrypted2)).toBe(secret);
    });

    it('should throw error if key is missing or wrong length', () => {
        const originalKey = process.env.ENCRYPTION_KEY;

        process.env.ENCRYPTION_KEY = '';
        expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY is not defined');

        process.env.ENCRYPTION_KEY = 'short';
        expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY must be exactly 32 characters long');

        process.env.ENCRYPTION_KEY = originalKey;
    });
});
