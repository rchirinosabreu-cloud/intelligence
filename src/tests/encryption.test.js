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

    it('should work with 64-character hexadecimal key', () => {
        const originalKey = process.env.ENCRYPTION_KEY;
        process.env.ENCRYPTION_KEY = '4f92b7c6a1e8d35f04298ab6c4d7e1f39a2c5b8d0e7f14a63b9c8d2e5f0a1b7c';

        const secret = 'hex-key-test';
        const encrypted = encrypt(secret);
        const decrypted = decrypt(encrypted);

        expect(decrypted).toBe(secret);
        process.env.ENCRYPTION_KEY = originalKey;
    });

    it('should throw error if key is missing or wrong length', () => {
        const originalKey = process.env.ENCRYPTION_KEY;

        process.env.ENCRYPTION_KEY = '';
        expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY is not defined');

        process.env.ENCRYPTION_KEY = 'short';
        expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY must be 32 characters or a 64-character hex string');

        process.env.ENCRYPTION_KEY = originalKey;
    });
});
