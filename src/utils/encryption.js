import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const IV_LENGTH = 16; // For AES, this is always 16

function getEncryptionKey() {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        throw new Error('ENCRYPTION_KEY is not defined in environment variables.');
    }
    if (key.length !== 32) {
        throw new Error('ENCRYPTION_KEY must be exactly 32 characters long.');
    }
    return key;
}

/**
 * Encrypts a string using AES-256-CBC.
 * @param {string} text - The text to encrypt.
 * @returns {string} - The encrypted string in format: iv:encryptedData
 */
export function encrypt(text) {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
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
    const key = getEncryptionKey();
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
    let decrypted = decipher.update(encryptedText);

    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString();
}
