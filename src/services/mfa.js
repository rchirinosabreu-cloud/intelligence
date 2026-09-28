import QRCode from 'qrcode';
import prisma from '../lib/prisma.js';
import { decrypt, encrypt } from '../utils/encryption.js';
import { createMfaService } from './mfaService.js';

// Instancia de producción del servicio de segundo factor: Prisma, ENCRYPTION_KEY y el QR
// dibujado en el servidor (la CSP ya permite imágenes data:).
export const mfaService = createMfaService({
    db: prisma,
    encrypt,
    decrypt,
    renderQr: (uri) => QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 1, width: 240 })
});
