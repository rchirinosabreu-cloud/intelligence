import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const IV_LENGTH = 16; // For AES, this is always 16

function getEncryptionKey() {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        throw new Error('ENCRYPTION_KEY is not defined in environment variables.');
    }

    // Support both 32-character strings and 64-character hexadecimal strings
    if (key.length === 64) {
        return Buffer.from(key, 'hex');
    } else if (key.length === 32) {
        return Buffer.from(key);
    } else {
        throw new Error('ENCRYPTION_KEY must be 32 characters or a 64-character hex string.');
    }
}

/**
 * Encrypts a string using AES-256-CBC.
 * @param {string} text - The text to encrypt.
 * @returns {string} - The encrypted string in format: iv:encryptedData
 */
export function encrypt(text) {
    const keyBuffer = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
    let encrypted = cipher.update(text);

    encrypted = Buffer.concat([encrypted, cipher.final()]);

    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

/**
 * Decrypts a string encrypted with AES-256-CBC.
 * @param {string} text - The encrypted string in format: iv:encryptedData
 * @returns {string} - The decrypted text.
 */
export function decrypt(text) {
    const keyBuffer = getEncryptionKey();
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
    let decrypted = decipher.update(encryptedText);

    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString();
}
