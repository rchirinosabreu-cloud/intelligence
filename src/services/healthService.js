import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import credentials from '../lib/googleCredentials.js';

export function findColumnIndex(headers, keywords) {
    if (!headers || !Array.isArray(headers)) return -1;
    const lowerKeywords = keywords.map(k => k.toLowerCase());
    return headers.findIndex(h => {
        const header = String(h || "").toLowerCase().trim();
        return lowerKeywords.includes(header);
    });
}

export async function fetchClientHealth() {
    console.log('[ClientHealth] Fetching client health indicators...');
    const SHEET_ID = process.env.AGENCY_TASKS_SHEET_ID;

    if (!SHEET_ID || !credentials) {
        throw new Error("Missing SHEET_ID or credentials.");
    }

    try {
        const authClient = new JWT({
            email: credentials.client_email,
            key: credentials.private_key,
            subject: process.env.GOOGLE_CALENDAR_ID || process.env.GOOGLE_WORKSPACE_SUBJECT || 'contacto@brainstudioagencia.com',
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const doc = new GoogleSpreadsheet(SHEET_ID, authClient);
        await doc.loadInfo();

        const sheetTitle = "INDICADORES 2026";
        const sheet = doc.sheetsByTitle[sheetTitle];

        if (!sheet) {
            const available = doc.sheetsByIndex.map(s => s.title).join(', ');
            console.error(`[ClientHealth] Sheet "${sheetTitle}" not found. Available: ${available}`);
            throw new Error(`Sheet "${sheetTitle}" not found.`);
        }

        await sheet.loadHeaderRow(3);
        const headers = sheet.headerValues;

        let colNameIndex = findColumnIndex(headers, ['cliente', 'nombre', 'marca', 'cuenta']);
        if (colNameIndex < 0) colNameIndex = 1;

        let colStatusIndex = findColumnIndex(headers, ['estado', 'status', 'estatus', 'semáforo', 'semaforo', 'indicador', 'situación', 'situacion']);
        if (colStatusIndex < 0) colStatusIndex = 10;

        const rows = await sheet.getRows();
        const clients = [];

        for (const row of rows) {
             const data = row._rawData || [];
             const name = String(data[colNameIndex] || "").trim();
             const statusText = String(data[colStatusIndex] || "").trim();

             if (!name) continue;

             let status = 'neutral';
             let priority = 5;

             const lowerStatus = statusText.toLowerCase();

             if (lowerStatus.includes('crítico') || lowerStatus.includes('critico') ||
                 lowerStatus.includes('atención') || lowerStatus.includes('atencion') ||
                 lowerStatus.includes('riesgo') || lowerStatus.includes('urgente') ||
                 lowerStatus.includes('demora') || lowerStatus.includes('retraso')) {
                 status = 'critical';
                 priority = 1;
             } else if (lowerStatus.includes('al día') || lowerStatus.includes('al dia') || lowerStatus.includes('ok')) {
                 status = 'ok';
                 priority = 2;
             } else if (lowerStatus.includes('servicios') || lowerStatus.includes('servicio')) {
                 status = 'services';
                 priority = 3;
             } else if (lowerStatus.includes('sin parrilla') || lowerStatus.includes('no grid')) {
                 status = 'no_grid';
                 priority = 4;
             } else {
                 status = 'neutral';
                 priority = 5;
             }

             clients.push({
                 name: name,
                 status: status,
                 status_text: statusText || "Sin estado",
                 priority: priority
             });
        }

        clients.sort((a, b) => a.priority - b.priority);
        return clients;
    } catch (error) {
        console.error('[ClientHealth] Error fetching client health:', error);
        throw error;
    }
}
