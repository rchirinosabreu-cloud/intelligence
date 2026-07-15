import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import xlsx from 'xlsx';
import prisma from '../src/lib/prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Real identity mapping dictionary for production-grade syncing
const IDENTITY_MAP = {
    "claudia": "claudiam.munozgil@gmail.com",
    "claudia/keila": "claudiam.munozgil@gmail.com",
    "elisa mestra": "elisamestravargas@gmail.com",
    "elisa": "elisamestravargas@gmail.com",
    "francisco villa": "fvilladigital@gmail.com",
    "francisco": "fvilladigital@gmail.com",
    "melissa castaño": "melissacastanobrain@gmail.com",
    "melissa": "melissacastanobrain@gmail.com",
    "jarlan": "espinosajarlan@gmail.com",
    "kamila": "kamila.del.toro@brainstudio.com",
    "gabriel/kamila": "kamila.del.toro@brainstudio.com",
    "camila": "camila@brainstudio.com",
    "helen": "helen@brainstudio.com",
    "practicante": "practicante@brainstudio.com",
    "rodny": "chrodny@gmail.com"
};

function resolveEmail(rawName) {
    const key = String(rawName || '').trim().toLowerCase();
    if (IDENTITY_MAP[key]) return IDENTITY_MAP[key];

    // If it's already an email, return it directly
    if (key.includes('@')) return key;

    // Default fallback to prevent crash
    return `${key.replace(/\s+/g, '')}@brainstudio.com`;
}

// Download file from S3 bucket
async function downloadFromS3(key, localPath) {
    const endpoint = process.env.AWS_ENDPOINT_URL || "https://t3.storageapi.dev";
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const bucket = process.env.AWS_S3_BUCKET_NAME || "chat-evidence";

    if (!accessKeyId || !secretAccessKey) {
        console.warn(`[S3 Downloader] S3 Credentials missing. Cannot pull ${key}.`);
        return false;
    }

    const s3Client = new S3Client({
        endpoint,
        region: "us-east-1",
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true,
    });

    try {
        console.log(`[S3 Downloader] Fetching s3://${bucket}/${key}...`);
        const response = await s3Client.send(new GetObjectCommand({
            Bucket: bucket,
            Key: key,
        }));

        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, buffer);
        console.log(`[S3 Downloader] Successfully downloaded to ${localPath}`);
        return true;
    } catch (err) {
        console.error(`[S3 Downloader] Failed to fetch ${key}:`, err.message);
        return false;
    }
}

// Clean names/titles
function cleanString(val) {
    if (!val) return '';
    return String(val).trim().replace(/^"|"$/g, '');
}

async function seedTeam() {
    console.log("--- INICIANDO PROCESO DE SEMBRADO DE EQUIPO Y USUARIOS (FASE 1) ---");

    const dataDir = path.join(__dirname, '../data');
    const file2026Local = path.join(dataDir, 'FINANZAS_BRAIN_STUDIO_2026.xlsx');

    // Try to fetch Excel if not present
    if (!fs.existsSync(file2026Local) && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        await downloadFromS3('Financials/FINANZAS BRAIN STUDIO 2026.xlsx', file2026Local);
    }

    if (!fs.existsSync(file2026Local)) {
        console.warn("WARNING: FINANZAS_BRAIN_STUDIO_2026.xlsx not found. Creating real-template mock file to proceed offline...");
        // Auto generate to allow offline local sandbox runs with the actual required staff
        const wb = xlsx.utils.book_new();
        const rowsNomina = [
            ['Colaborador/Email', 'Salario Base', 'Seguridad Social', 'Fecha Inicio', 'Fecha Fin'],
            ['francisco.villa@brainstudio.com', 6000000, 800000, '2021-01-01', ''],
            ['claudia@brainstudio.com', 3500000, 500000, '2021-01-01', ''],
            ['elisa.mestra@brainstudio.com', 4000000, 550000, '2021-01-01', ''],
            ['melissa.castano@brainstudio.com', 3800000, 520000, '2021-01-01', ''],
            ['camila@brainstudio.com', 3200000, 450000, '2021-01-01', ''],
            ['jarlan@brainstudio.com', 3000000, 420000, '2021-01-01', ''],
            ['helen@brainstudio.com', 2800000, 400000, '2021-01-01', ''],
            ['kamila.del.toro@brainstudio.com', 4500000, 600000, '2021-01-01', ''],
            ['practicante@brainstudio.com', 1300000, 150000, '2021-01-01', '']
        ];
        const ws_nomina = xlsx.utils.aoa_to_sheet(rowsNomina);
        xlsx.utils.book_append_sheet(wb, ws_nomina, 'NOMINA');
        xlsx.writeFile(wb, file2026Local);
    }

    const hasDB = !!process.env.DATABASE_URL;
    if (!hasDB) {
        console.warn("WARNING: DATABASE_URL not found. Skipping live database mutations, but running full local Excel parser dry-run for validation!");
    }

    try {
        // --- STEP 1: HOT DATA CORRECTIONS (SURGICAL CLEANUP) ---
        if (hasDB) {
            console.log("Executing surgical identity data cleaning...");

            // a) Restore chrodny's name to "Rodny Chirinos"
            const chrodny = await prisma.user.findUnique({ where: { email: 'chrodny@gmail.com' } });
            if (chrodny) {
                await prisma.user.update({
                    where: { id: chrodny.id },
                    data: { name: "Rodny Chirinos" }
                });
                console.log("Restored Rodny Chirinos' identity name.");
            }

            // b) Purge admin@brainstudio.com from TeamMember
            const adminUser = await prisma.user.findUnique({ where: { email: 'admin@brainstudio.com' } });
            if (adminUser) {
                await prisma.teamMember.deleteMany({
                    where: { userId: adminUser.id }
                });
                console.log("Successfully purged admin@brainstudio.com from public TeamMember listings.");
            }
        }

        // --- STEP 2: PARSE NOMINA SHEET ---
        console.log(`Loading NOMINA sheet from ${file2026Local}...`);
        const wb = xlsx.readFile(file2026Local);
        const wsNomina = wb.Sheets['NOMINA'] || wb.Sheets[wb.SheetNames[0]];
        const rowsNomina = xlsx.utils.sheet_to_json(wsNomina, { header: 1 });

        console.log(`Parsed ${rowsNomina.length} rows from NOMINA.`);
        if (rowsNomina.length < 2) {
            console.error("NOMINA sheet is empty or lacks headers.");
            return;
        }

        const headers = rowsNomina[0].map(h => cleanString(h).toUpperCase());
        const emailIdx = headers.indexOf('COLABORADOR/EMAIL');

        if (emailIdx === -1) {
            console.error("Critical: NOMINA sheet lacks 'Colaborador/Email' header.");
            return;
        }

        const blacklistedEmails = ['admin@brainstudio.com', 'test@brainstudio.com'];

        for (let r = 1; r < rowsNomina.length; r++) {
            const row = rowsNomina[r];
            if (!row || row.length === 0) continue;

            const rawEmailOrName = cleanString(row[emailIdx]);
            if (!rawEmailOrName) continue;

            // Resolve real production email using IDENTITY_MAP
            const email = resolveEmail(rawEmailOrName);

            // Skip blacklist items to block mock users or admin rows from public TeamMember
            if (blacklistedEmails.includes(email)) {
                console.log(`Skipping blacklisted user row: ${email}`);
                continue;
            }

            // Generate clean human-readable names
            let name = email.split('@')[0].split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
            if (email === 'chrodny@gmail.com') name = 'Rodny Chirinos';
            if (email === 'claudiam.munozgil@gmail.com') name = 'Claudia';
            if (email === 'elisamestravargas@gmail.com') name = 'Elisa Mestra';
            if (email === 'fvilladigital@gmail.com') name = 'Francisco Villa';
            if (email === 'melissacastanobrain@gmail.com') name = 'Melissa Castaño';
            if (email === 'espinosajarlan@gmail.com') name = 'Jarlan';

            let role = 'EDITOR';
            if (email === 'chrodny@gmail.com' || email === 'fvilladigital@gmail.com' || email === 'elisamestravargas@gmail.com') {
                role = 'ADMIN'; // Key admins
            }

            const hasFinancialAccess = email === 'chrodny@gmail.com' || email === 'fvilladigital@gmail.com' || email === 'elisamestravargas@gmail.com';

            console.log(`Parsed team member: Name: ${name}, Email: ${email}, Role: ${role}, Financial Access: ${hasFinancialAccess}`);

            if (hasDB) {
                // 1. Upsert User (NON-DESTRUCTIVE for name, role, avatarUrl)
                const user = await prisma.user.upsert({
                    where: { email },
                    update: {
                        // We do NOT overwrite name, role or avatarUrl here to prevent wiping production custom modifications
                        hasFinancialAccess
                    },
                    create: {
                        name,
                        email,
                        password: 'password_hashed_seeded',
                        role,
                        hasFinancialAccess,
                        isActive: true
                    }
                });

                // 2. Upsert corresponding TeamMember
                const existingMember = await prisma.teamMember.findUnique({
                    where: { userId: user.id }
                });

                const memberRole = role === 'ADMIN' ? 'Project Manager' : 'Editor de Video';

                if (existingMember) {
                    await prisma.teamMember.update({
                        where: { id: existingMember.id },
                        data: {
                            // Non-destructive update pattern
                            role: memberRole,
                            email
                        }
                    });
                } else {
                    await prisma.teamMember.create({
                        data: {
                            name,
                            role: memberRole,
                            email,
                            userId: user.id,
                            isActive: true
                        }
                    });
                }
                console.log(`Successfully seeded/synced user & team member in PostgreSQL: ${email}`);
            }
        }

        console.log("--- SEEDING DE EQUIPO COMPLETADO CON ÉXITO ---");

    } catch (err) {
        console.error("Critical Error during team seeding:", err);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

seedTeam();
