import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import xlsx from 'xlsx';
import prisma from '../src/lib/prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
        console.warn("WARNING: FINANZAS_BRAIN_STUDIO_2026.xlsx not found. Creating default mock file to proceed offline...");
        // Auto generate to allow offline local sandbox runs
        const wb = xlsx.utils.book_new();
        const rowsNomina = [
            ['Colaborador/Email', 'Salario Base', 'Seguridad Social', 'Fecha Inicio', 'Fecha Fin'],
            ['admin@brainstudio.com', 3000000, 400000, '2021-01-01', ''],
            ['chrodny@gmail.com', 4500000, 550000, '2021-01-01', '']
        ];
        const ws_nomina = xlsx.utils.aoa_to_sheet(rowsNomina);
        xlsx.utils.book_append_sheet(wb, ws_nomina, 'NOMINA');
        xlsx.writeFile(wb, file2026Local);
    }

    const hasDB = !!process.env.DATABASE_URL;
    if (!hasDB) {
        console.warn("WARNING: DATABASE_URL not found. Skipping live database mutations (upsert/insert), but running full local Excel parser dry-run for validation!");
    }

    try {
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

        for (let r = 1; r < rowsNomina.length; r++) {
            const row = rowsNomina[r];
            if (!row || row.length === 0) continue;

            const email = cleanString(row[emailIdx]).toLowerCase();
            if (!email) continue;

            const name = email.split('@')[0];
            let role = 'EDITOR';
            if (email.includes('admin')) role = 'ADMIN';
            if (email.includes('rodny')) role = 'ADMIN'; // Rodny is admin

            const hasFinancialAccess = email.includes('admin') || email.includes('rodny');

            console.log(`Parsed team member: Name: ${name}, Email: ${email}, Role: ${role}, Financial Access: ${hasFinancialAccess}`);

            if (hasDB) {
                // 1. Upsert User
                const user = await prisma.user.upsert({
                    where: { email },
                    update: {
                        name,
                        role,
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

                if (existingMember) {
                    await prisma.teamMember.update({
                        where: { id: existingMember.id },
                        data: {
                            name,
                            role: role === 'ADMIN' ? 'Project Manager' : 'Editor de Video',
                            email
                        }
                    });
                } else {
                    await prisma.teamMember.create({
                        data: {
                            name,
                            role: role === 'ADMIN' ? 'Project Manager' : 'Editor de Video',
                            email,
                            userId: user.id,
                            isActive: true
                        }
                    });
                }
                console.log(`Successfully seeded user & team member in PostgreSQL: ${email}`);
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
