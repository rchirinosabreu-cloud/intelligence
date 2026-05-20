import { spawn } from 'child_process';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

/**
 * Service to manage OpenClaw automation (Brain-Hands)
 * Uses Playwright for QR capture and CLI wrapper for agent commands.
 */
class AutomationService {
    constructor() {
        // Persistence directory for Railway (ensure it survives deployments if possible)
        // In Railway, usually /data or similar is persistent, but for now we use project root
        this.stateDir = path.join(process.cwd(), '.openclaw_data');
        if (!fs.existsSync(this.stateDir)) {
            fs.mkdirSync(this.stateDir, { recursive: true });
        }
    }

    /**
     * Captures the WhatsApp QR code from web.whatsapp.com using Playwright.
     * Uses a persistent userDataDir so once linked, it stays linked.
     */
    async vincularChat() {
        console.log("[Brain-Hands] Iniciando vinculación de WhatsApp via Playwright...");
        let context;
        try {
            // Path for the persistent session
            const userDataDir = path.join(this.stateDir, 'whatsapp_session');

            context = await chromium.launchPersistentContext(userDataDir, {
                headless: true,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                viewport: { width: 1280, height: 720 },
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu',
                    '--disable-blink-features=AutomationControlled'
                ]
            });

            // Eliminar la propiedad 'webdriver' para que WhatsApp no nos detecte
            await context.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            });

            const page = await context.newPage();

            // Set a generous timeout for WhatsApp Web
            await page.goto('https://web.whatsapp.com', {
                waitUntil: 'networkidle',
                timeout: 60000
            });

            console.log("[Brain-Hands] Comprobando estado de sesión...");

            // Check if we are already logged in (pane-side exists) or if we need QR (canvas exists)
            try {
                // Wait for either the QR or the main interface - increased timeout to 60s
                await Promise.race([
                    page.waitForSelector('canvas', { timeout: 60000 }),
                    page.waitForSelector('div[id="pane-side"]', { timeout: 60000 })
                ]);
            } catch (e) {
                console.log("[Brain-Hands] Timeout esperando carga inicial.");
            }

            const qrCanvas = await page.$('canvas');
            if (qrCanvas) {
                console.log("[Brain-Hands] QR detectado. Capturando...");
                const buffer = await qrCanvas.screenshot();
                const base64 = buffer.toString('base64');

                // MANTENER EL NAVEGADOR ABIERTO:
                // No cerramos el contexto inmediatamente. Lo dejamos vivir en segundo plano
                // para que WhatsApp complete el handshake del escaneo.
                // Se cerrará automáticamente tras 3 minutos o al detectar éxito.
                (async () => {
                    // Simular actividad cada 30 segundos para que no se pause la sincronización
                    const activityInterval = setInterval(async () => {
                        try {
                            if (page && !page.isClosed()) {
                                await page.mouse.move(Math.random() * 100, Math.random() * 100);
                            }
                        } catch (e) {}
                    }, 30000);

                    try {
                        console.log("[Brain-Hands] Esperando escaneo (3 min timeout)...");
                        await page.waitForSelector('div[id="pane-side"]', { timeout: 180000 });
                        console.log("[Brain-Hands] ¡Vinculación Exitosa detectada en segundo plano!");
                    } catch (err) {
                        console.log("[Brain-Hands] El tiempo de escaneo expiró o hubo un error.");
                    } finally {
                        clearInterval(activityInterval);
                        try { await context.close(); } catch (e) {}
                    }
                })();

                return {
                    qr: `data:image/png;base64,${base64}`,
                    status: 'qr_required'
                };
            }

            const isLoggedIn = await page.evaluate(() => {
                return !!document.querySelector('div[id="pane-side"]');
            });

            if (isLoggedIn) {
                console.log("[Brain-Hands] Sesión activa detectada.");
                await context.close();
                return { status: 'ready', message: 'WhatsApp ya está vinculado.' };
            } else {
                // Captura de debug antes del error
                const errorPath = path.join(this.stateDir, 'error.png');
                await page.screenshot({ path: errorPath });
                console.log(`[Brain-Hands] Error screenshot saved to ${errorPath}`);
                await context.close();
                throw new Error("No se pudo detectar el código QR ni una sesión activa en WhatsApp Web.");
            }
        } catch (error) {
            if (context) await context.close();
            console.error("[Brain-Hands] Error en vincularChat:", error);
            throw error;
        }
    }

    /**
     * Executes an OpenClaw CLI command using the shared state directory.
     */
    async executeCommand(command, args = []) {
        return new Promise((resolve, reject) => {
            const child = spawn('npx', ['openclaw', command, ...args], {
                env: {
                    ...process.env,
                    OPENCLAW_STATE_DIR: this.stateDir,
                    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY
                }
            });

            let output = '';
            let errorOutput = '';

            child.stdout.on('data', (data) => output += data.toString());
            child.stderr.on('data', (data) => errorOutput += data.toString());

            child.on('close', (code) => {
                if (code === 0) resolve(output);
                else reject(new Error(errorOutput || `Process exited with code ${code}`));
            });
        });
    }

    /**
     * Returns the current automation status
     */
    async getStatus() {
        const userDataDir = path.join(this.stateDir, 'whatsapp_session');
        const sessionExists = fs.existsSync(userDataDir) && fs.readdirSync(userDataDir).length > 0;

        return {
            status: sessionExists ? 'ready' : 'offline',
            persistence: userDataDir,
            engine: 'OpenClaw (CLI Wrapper)'
        };
    }
}

export default new AutomationService();
