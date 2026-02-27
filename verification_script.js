
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const colors = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m"
};

const log = (msg, color = colors.reset) => console.log(`${color}${msg}${colors.reset}`);

async function verifyEnvironment() {
    log("\n🔍 Starting Pre-flight Verification...\n", colors.cyan);

    let hasErrors = false;

    // 1. Check Node Version
    const nodeVersion = process.version;
    log(`[INFO] Node Version: ${nodeVersion}`, colors.reset);

    // 2. Check Critical Env Vars
    const requiredVars = [
        'DATABASE_URL',
        'GOOGLE_APPLICATION_CREDENTIALS_JSON',
        'AGENCY_TASKS_SHEET_ID'
    ];

    requiredVars.forEach(varName => {
        if (!process.env[varName]) {
            log(`[FAIL] Missing Environment Variable: ${varName}`, colors.red);
            hasErrors = true;
        } else {
            log(`[PASS] Found ${varName}`, colors.green);
        }
    });

    // 3. Verify Google Credentials Format
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        try {
            const creds = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
            if (!creds.project_id || !creds.client_email || !creds.private_key) {
                log(`[FAIL] GOOGLE_APPLICATION_CREDENTIALS_JSON is missing required fields (project_id, client_email, private_key)`, colors.red);
                hasErrors = true;
            } else {
                log(`[PASS] Google Credentials JSON is valid (Project: ${creds.project_id})`, colors.green);
            }
        } catch (e) {
            log(`[FAIL] GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON`, colors.red);
            hasErrors = true;
        }
    }

    // 4. Test Database Connection (Prisma)
    if (process.env.DATABASE_URL) {
        log(`[INFO] Testing Database Connection...`, colors.cyan);
        const prisma = new PrismaClient();
        try {
            await prisma.$connect();
            log(`[PASS] Database Connection Successful`, colors.green);
            await prisma.$disconnect();
        } catch (e) {
            log(`[FAIL] Database Connection Failed: ${e.message}`, colors.red);
            hasErrors = true;
        }
    }

    console.log("\n---------------------------------------------------");
    if (hasErrors) {
        log("❌ Verification Failed. Please fix the issues above before deploying.", colors.red);
        process.exit(1);
    } else {
        log("✅ All Systems Go! Environment looks ready for deployment.", colors.green);
        process.exit(0);
    }
}

verifyEnvironment();
