import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { createServer } from 'vite';
import { createMfaService, MfaError } from '../src/services/mfaService.js';
import { createMfaLoginHandlers } from '../src/controllers/mfaLoginController.js';
import { isMfaRequiredForRole, mfaEnrollmentBlock } from '../src/lib/mfaPolicy.js';

// Verificación en dos pasos, laboratorio local (27 de septiembre de 2026). Sin dotenv, sin
// base de datos real y sin correos: una tabla en memoria con la forma de Prisma. Las rutas
// usan los mismos servicios que producción.

const SECRET = 'preview-mfa-secret-que-no-es-de-produccion-000';
const REQUIRED_ROLES = 'ADMIN';

const memoryDb = (rows) => {
    const byId = new Map(rows.map((row) => [row.id, row]));
    const apply = (row, data) => {
        for (const [key, value] of Object.entries(data)) {
            row[key] = value && typeof value === 'object' && 'increment' in value ? (row[key] || 0) + value.increment : value;
        }
    };
    const matches = (row, where) => Object.entries(where).every(([key, value]) => (
        value && typeof value === 'object' && 'equals' in value
            ? JSON.stringify(row[key]) === JSON.stringify(value.equals)
            : (row[key] ?? null) === value
    ));
    return {
        byEmail: (email) => rows.find((row) => row.email === email),
        user: {
            findUnique: async ({ where }) => (byId.has(where.id) ? { ...byId.get(where.id) } : null),
            update: async ({ where, data }) => { apply(byId.get(where.id), data); return { ...byId.get(where.id) }; },
            updateMany: async ({ where, data }) => {
                const row = byId.get(where.id);
                if (!row || !matches(row, where)) return { count: 0 };
                apply(row, data);
                return { count: 1 };
            }
        }
    };
};

const person = async (id, name, email, role) => ({
    id, name, email, role, isActive: true, teamMember: { isActive: true },
    password: await bcrypt.hash('MuestraBrain2026!', 8), sessionVersion: 0, mustChangePassword: false,
    hasFinancialAccess: false, financialRole: 'NONE', modulePermissions: {},
    mfaSecret: null, mfaPendingSecret: null, mfaEnabledAt: null, mfaLastUsedStep: null,
    mfaRecoveryCodes: null, mfaFailedAttempts: 0, mfaLockedUntil: null
});

export async function createMfaPreview({ port = 3113 } = {}) {
    const db = memoryDb([
        await person('u-admin', 'Rodny Muestra', 'rodny@example.test', 'ADMIN'),
        await person('u-editor', 'Ana Muestra', 'ana@example.test', 'EDITOR')
    ]);
    const mfa = createMfaService({
        db,
        encrypt: (text) => `local:${Buffer.from(text).toString('base64')}`,
        decrypt: (text) => Buffer.from(text.replace(/^local:/, ''), 'base64').toString(),
        renderQr: (uri) => QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 1, width: 240 }),
        requiredRoles: REQUIRED_ROLES
    });
    const login = createMfaLoginHandlers({ db, mfa, jwtSecret: SECRET, expiresIn: '1h', trace: async () => {}, requiredRoles: REQUIRED_ROLES });

    const api = express();
    api.use(express.json({ limit: '20kb' }));
    api.post('/api/login', async (req, res) => {
        const user = db.byEmail(String(req.body?.email || '').trim().toLowerCase());
        if (!user || !(await bcrypt.compare(String(req.body?.password || ''), user.password))) {
            return res.status(401).json({ message: 'Credenciales incorrectas' });
        }
        return login.respondAfterPassword({ ...user }, res);
    });
    api.post('/api/login/mfa', (req, res) => login.verifyLogin(req, res));
    api.use('/api', async (req, res, next) => {
        try {
            const payload = jwt.verify(String(req.headers.authorization || '').replace(/^Bearer /, ''), SECRET);
            const dbUser = await db.user.findUnique({ where: { id: payload.userId } });
            if (!dbUser || dbUser.sessionVersion !== payload.sessionVersion) return res.status(401).json({ code: 'TOKEN_REVOKED' });
            const block = mfaEnrollmentBlock(dbUser, req, REQUIRED_ROLES);
            if (block) return res.status(428).json(block);
            req.user = { ...payload, role: dbUser.role };
            return next();
        } catch {
            return res.status(401).json({ code: 'TOKEN_INVALID' });
        }
    });
    const handle = (fn) => async (req, res) => {
        try { return res.json(await fn(req)); }
        catch (error) {
            if (error instanceof MfaError) return res.status(error.status).json({ code: error.code, error: error.message });
            console.error(error);
            return res.status(500).json({ error: 'Error de la muestra' });
        }
    };
    api.get('/api/auth/me', handle(async (req) => {
        const user = await db.user.findUnique({ where: { id: req.user.userId } });
        return { id: user.id, name: user.name, email: user.email, role: user.role, mfaEnabled: Boolean(user.mfaEnabledAt), mfaEnrollmentRequired: !user.mfaEnabledAt && isMfaRequiredForRole(user.role, REQUIRED_ROLES) };
    }));
    api.get('/api/user/mfa', handle((req) => mfa.getStatus(req.user.userId)));
    api.post('/api/user/mfa/setup', handle((req) => mfa.beginEnrollment(req.user.userId)));
    api.post('/api/user/mfa/confirm', handle((req) => mfa.confirmEnrollment(req.user.userId, req.body?.code)));
    api.post('/api/user/mfa/recovery-codes', handle((req) => mfa.regenerateRecoveryCodes(req.user.userId, req.body?.code)));
    api.delete('/api/user/mfa', handle((req) => mfa.disable(req.user.userId, req.body || {})));
    api.all('/api/*', (req, res) => res.status(404).json({ error: 'Solo la verificación en dos pasos está disponible en esta muestra.' }));

    const root = path.resolve(import.meta.dirname, '..');
    const server = await createServer({
        configFile: false, root, envDir: path.resolve(root, 'tests/fixtures'),
        cacheDir: path.resolve(root, 'node_modules/.vite-mfa'), appType: 'mpa',
        optimizeDeps: { entries: ['tests/fixtures/mfa-preview.html'] }, esbuild: { jsx: 'automatic' },
        define: { __BUILD_SHA__: JSON.stringify('local-mfa'), 'import.meta.env.VITE_API_URL': 'window.location.origin' },
        resolve: { alias: { '@': path.resolve(root, 'src') } }, logLevel: 'warn',
        server: { host: '127.0.0.1', port, strictPort: port !== 0, proxy: {} },
        plugins: [{ name: 'isolated-mfa-preview', configureServer(vite) {
            vite.middlewares.use((req, res, next) => {
                res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' ws://127.0.0.1:*; worker-src 'self' blob:; frame-src 'none'");
                const { pathname } = new URL(req.url, 'http://localhost');
                if (pathname.startsWith('/api/')) return api(req, res, next);
                if (req.headers.accept?.includes('text/html') && !pathname.includes('.')) req.url = '/tests/fixtures/mfa-preview.html';
                return next();
            });
        } }]
    });
    await server.listen();
    return { origin: `http://127.0.0.1:${server.httpServer.address().port}`, db, close: () => server.close() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const preview = await createMfaPreview();
    console.log(`Verificación en dos pasos local: ${preview.origin}/ (rodny@example.test o ana@example.test, clave MuestraBrain2026!)`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.close(); process.exit(0); });
}
