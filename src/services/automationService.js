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
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
                viewport: { width: 1280, height: 800 }
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
                // Wait for either the QR or the main interface
                await Promise.race([
                    page.waitForSelector('canvas', { timeout: 30000 }),
                    page.waitForSelector('div[id="pane-side"]', { timeout: 30000 })
                ]);
            } catch (e) {
                console.log("[Brain-Hands] Timeout esperando carga inicial.");
            }

            const qrCanvas = await page.$('canvas');
            if (qrCanvas) {
                console.log("[Brain-Hands] QR detectado. Capturando...");
                const buffer = await qrCanvas.screenshot();
                const base64 = buffer.toString('base64');

                await context.close();

                return {
                    qr: `data:image/png;base64,${base64}`,
                    status: 'qr_required'
                };
            }

            const isLoggedIn = await page.evaluate(() => {
                return !!document.querySelector('div[id="pane-side"]');
            });

            await context.close();

            if (isLoggedIn) {
                console.log("[Brain-Hands] Sesión activa detectada.");
                return { status: 'ready', message: 'WhatsApp ya está vinculado.' };
            } else {
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
