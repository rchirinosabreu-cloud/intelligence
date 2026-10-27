// Arranca el servidor de Intelligence en modo demo contra una base local de demo, con las integraciones
// apagadas (26 de octubre de 2026). Sirve para ver la agencia inventada antes de subirla a Railway:
//
//   node scripts/demo-local-server.mjs --base=postgresql://demo:demo@127.0.0.1:55450/intelligence_demo
//   npm run dev        (en otra terminal: el navegador habla con Vite y Vite reenvía /api a este puerto)
//
// Fija las variables ANTES de cargar `server.js`, así el `.env` —que apunta a producción— no las pisa: dotenv
// nunca sobreescribe una variable que ya existe. Las llaves de OpenAI, Fireflies, Meta, almacenamiento y push
// se vacían a propósito: una demo local no publica, no transcribe ni gasta créditos.
import { randomBytes } from 'node:crypto';
import { demoDatabaseProblem } from '../src/lib/demoMode.js';

const base = process.argv.find((a) => a.startsWith('--base='))?.slice(7) || process.env.DATABASE_URL;
process.env.DEMO_MODE = 'true';
process.env.DATABASE_URL = base || '';
const problem = demoDatabaseProblem(process.env);
if (problem) { console.error(`[Demo] ${problem}`); process.exit(1); }

process.env.PORT ||= '8080';
process.env.JWT_SECRET ||= randomBytes(32).toString('hex');
process.env.ENCRYPTION_KEY ||= randomBytes(16).toString('hex');
process.env.MFA_REQUIRED_ROLES = '';
// El navegador del escritorio abre 127.0.0.1 y la lista fija de CORS solo trae localhost.
process.env.CORS_ORIGINS = [process.env.CORS_ORIGINS, 'http://127.0.0.1:3000'].filter(Boolean).join(',');
for (const key of ['OPENAI_API_KEY', 'FIREFLIES_API_KEY', 'META_SYSTEM_USER_TOKEN', 'META_APP_SECRET', 'META_APP_ID', 'META_WHATSAPP_TOKEN',
    'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET_NAME', 'AWS_ENDPOINT_URL', 'BRIA_STORAGE_BUCKET', 'FINANCIAL_EVIDENCE_BUCKET',
    'WEB_PUSH_PUBLIC_KEY', 'WEB_PUSH_PRIVATE_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'GOOGLE_APPLICATION_CREDENTIALS_JSON',
    'DATABASE_PUBLIC_URL']) process.env[key] = '';

await import('../server.js');
