
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import dotenv from 'dotenv';

dotenv.config();

async function debugHealthSheet() {
    console.log("Starting Debug...");
    const SHEET_ID = process.env.AGENCY_TASKS_SHEET_ID;

    // Auth
    let credentials;
    try {
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
            credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
            if (credentials?.private_key) {
                credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
            }
        } else {
             console.error("Missing creds");
             return;
        }
    } catch (e) {
        console.error("Creds error", e);
        return;
    }

    const authClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(SHEET_ID, authClient);
    await doc.loadInfo();

    const sheet = doc.sheetsByTitle["INDICADORES 2026"];
    if (!sheet) {
        console.error("Sheet INDICADORES 2026 not found");
        return;
    }

    console.log("Loading Header Row (3)...");
    await sheet.loadHeaderRow(3);
    console.log("Headers:", sheet.headerValues);
    console.log(`Header count: ${sheet.headerValues.length}`);

    // Check specific columns
    console.log(`Header at Index 1 (Col B): "${sheet.headerValues[1]}"`); // Should be Client Name
    console.log(`Header at Index 10 (Col K): "${sheet.headerValues[10]}"`); // Supposed to be Status

    console.log("Loading rows...");
    const rows = await sheet.getRows(); // Loads rows after header (so starting row 4)

    console.log(`Loaded ${rows.length} rows.`);

    // Inspect specific clients mentioned in screenshot: "Pablo Hoff", "Salsipuedes"
    const targets = ["Pablo Hoff", "Salsipuedes", "Sunpartners"]; // Sunpartners works (Al día)

    for (const row of rows) {
        // Use raw data access to be sure what we get
        const data = row._rawData || [];
        const name = String(data[1] || "").trim(); // Col B (Index 1)

        if (targets.some(t => name.includes(t))) {
            console.log(`\n--- Client: ${name} ---`);
            console.log(`Row Number: ${row.rowNumber}`);

            // Print surrounding columns to find where the status is
            // Status should be "Crítico", "Al día", etc.
            // Let's print index 8 to 12
            for (let i = 8; i <= 14; i++) {
                console.log(`Index ${i} (Col ${String.fromCharCode(65+i)}): "${data[i]}"`);
            }
        }
    }
}

debugHealthSheet().catch(console.error);
