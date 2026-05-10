import { chromium } from 'playwright';
import prisma from '../lib/prisma.js';
import { performAdvancedExtraction, addAgencyContext } from './brainCoreService.js';
import fs from 'fs';
import path from 'path';

const STORAGE_PATH = './automation_session.json';
const QR_PATH = './public/automation_qr.png';

let browser = null;
let context = null;
let page = null;
let isInitializing = false;

export const initializeWhatsApp = async () => {
    if (isInitializing) return { status: 'initializing' };
    isInitializing = true;

    try {
        const config = await prisma.automationConfig.findUnique({ where: { id: 'global' } });

        browser = await chromium.launch({ headless: true });

        if (config?.storageState) {
            context = await browser.newContext({ storageState: config.storageState });
        } else {
            context = await browser.newContext();
        }

        page = await context.newPage();
        await page.goto('https://web.whatsapp.com');

        // Check if QR is needed
        try {
            await page.waitForSelector('canvas', { timeout: 10000 });
            await page.screenshot({ path: QR_PATH });
            isInitializing = false;
            return { status: 'qr_required', qrUrl: '/automation_qr.png' };
        } catch (e) {
            // Probably already logged in
            await saveSession();
            isInitializing = false;
            return { status: 'ready' };
        }
    } catch (error) {
        console.error("[WhatsAppAutomation] Init error:", error);
        isInitializing = false;
        return { status: 'error', message: error.message };
    }
};

const saveSession = async () => {
    const storageState = await context.storageState();
    await prisma.automationConfig.upsert({
        where: { id: 'global' },
        update: { storageState },
        create: { id: 'global', storageState }
    });
    if (fs.existsSync(QR_PATH)) fs.unlinkSync(QR_PATH);
};

export const listActiveChats = async () => {
    if (!page) await initializeWhatsApp();
    // Logic to scrape chat names and IDs
    const chats = await page.evaluate(() => {
        const list = document.querySelectorAll('span[title]');
        return Array.from(list).map(el => ({ name: el.getAttribute('title'), id: el.closest('div[role="row"]')?.dataset?.id || el.title }));
    });
    return chats.filter(c => c.name && c.name.length > 1);
};

export const runScrapingTask = async (chatName) => {
    if (!page) return;
    try {
        await page.click(`span[title="${chatName}"]`);
        await page.waitForTimeout(2000);

        // Take screenshot of the last messages
        const buffer = await page.screenshot();
        const extraction = await performAdvancedExtraction(buffer, 'image/png');

        if (extraction) {
            // Save as PENDING proposal
            await prisma.agencyContext.create({
                data: {
                    content: extraction.content,
                    type: 'IMAGE',
                    status: 'PENDING',
                    metadata: {
                        insights: extraction.insights,
                        source: 'OpenClaw Automation',
                        chat: chatName
                    }
                }
            });
        }
    } catch (error) {
        console.error("[WhatsAppAutomation] Scraping failed:", error);
    }
};
