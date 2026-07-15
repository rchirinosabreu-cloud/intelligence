import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import xlsx from 'xlsx';
import prisma from '../src/lib/prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to convert floats securely
const roundFloat = (val) => {
    return Math.round((val + Number.EPSILON) * 100) / 100;
};

// Helper to slugify client names
function slugify(text) {
    if (!text) return '';
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

// Standard date parsing function
function parseDate(val) {
    if (!val) return new Date();
    if (val instanceof Date) return val;

    // Excel date numeric format
    if (typeof val === 'number') {
        return new Date((val - 25569) * 86400 * 1000);
    }

    // String formats
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
        return new Date(str);
    }
    if (/^\d{4}-\d{2}/.test(str)) {
        return new Date(`${str}-01`);
    }

    // Handlers for formats like "Ene 21", "Ene-21", "Jan-21", etc.
    const monthMap = {
        ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
        jan: 0, apr: 3, aug: 7, dec: 11
    };

    const parts = str.split(/[\s-]/);
    if (parts.length === 2) {
        const mStr = parts[0].toLowerCase().substring(0, 3);
        const yStr = parts[1];
        const month = monthMap[mStr] !== undefined ? monthMap[mStr] : 0;
        let year = parseInt(yStr);
        if (year < 100) {
            year += year < 50 ? 2000 : 1900;
        }
        return new Date(year, month, 1);
    }

    const parsed = Date.parse(str);
    if (!isNaN(parsed)) {
        return new Date(parsed);
    }
    return new Date();
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

// Programmatic mock Excel generator for development/testing if no files are found
function generateMockExcels(dataDir) {
    console.log("Generating real-template mock Excel files for testing/development...");

    // 1. FINANZAS_BRAIN_STUDIO_2021_2025.xlsx
    const wb1 = xlsx.utils.book_new();

    // Years 2021-2025 sheet headers: Concepto, months from 2021-01 to 2025-12
    const headers1 = ['Concepto'];
    for (let y = 2021; y <= 2025; y++) {
        for (let m = 1; m <= 12; m++) {
            headers1.push(`${y}-${String(m).padStart(2, '0')}-01`);
        }
    }

    const rows1 = [
        headers1,
        ['INGRESOS'],
        ['Gobernación de Bolívar', ...Array(60).fill(6000000)],
        ['Mio Agencia', ...Array(60).fill(4000000)],
        ['Unimudanzas', ...Array(60).fill(3000000)],
        ['Grupo Brieva', ...Array(60).fill(3500000)],
        ['Elvira', ...Array(60).fill(2500000)],
        ['Muebles Nuva', ...Array(60).fill(3000000)],
        ['SunPartners', ...Array(60).fill(3000000)],
        ['EGRESOS'],
        ['Nómina', ...Array(60).fill(10000000)],
        ['Pauta', ...Array(60).fill(4000000)],
        ['Logística', ...Array(60).fill(1500000)],
        ['Administrativo', ...Array(60).fill(2000000)],
        ['Impuestos', ...Array(60).fill(1200000)],
        ['Financiero', ...Array(60).fill(300000)],
        ['Operativo', ...Array(60).fill(800000)]
    ];

    const ws1 = xlsx.utils.aoa_to_sheet(rows1);
    xlsx.utils.book_append_sheet(wb1, ws1, 'Resumen BRAIN AÑOS');
    xlsx.writeFile(wb1, path.join(dataDir, 'FINANZAS_BRAIN_STUDIO_2021_2025.xlsx'));

    // 2. FINANZAS_BRAIN_STUDIO_2026.xlsx
    const wb2 = xlsx.utils.book_new();

    // FINANZAS BRAIN STUDIO 2026 sheet
    const headers2 = ['Concepto'];
    for (let m = 1; m <= 12; m++) {
        headers2.push(`2026-${String(m).padStart(2, '0')}-01`);
    }
    const rows2 = [
        headers2,
        ['INGRESOS'],
        ['Gobernación de Bolívar', ...Array(12).fill(6000000)],
        ['Mio Agencia', ...Array(12).fill(4000000)],
        ['Unimudanzas', ...Array(12).fill(3000000)],
        ['Grupo Brieva', ...Array(12).fill(3500000)],
        ['Elvira', ...Array(12).fill(2500000)],
        ['Muebles Nuva', ...Array(12).fill(3000000)],
        ['SunPartners', ...Array(12).fill(3000000)],
        ['EGRESOS'],
        ['Nómina', ...Array(12).fill(12000000)],
        ['Pauta', ...Array(12).fill(5000000)],
        ['Logística', ...Array(12).fill(2000000)],
        ['Administrativo', ...Array(12).fill(2500000)],
        ['Impuestos', ...Array(12).fill(1500000)],
        ['Financiero', ...Array(12).fill(400000)],
        ['Operativo', ...Array(12).fill(1000000)]
    ];
    const ws2_main = xlsx.utils.aoa_to_sheet(rows2);
    xlsx.utils.book_append_sheet(wb2, ws2_main, 'FINANZAS BRAIN STUDIO 2026');

    // MOROSOS sheet - Sums exactly to $38,755,614
    const rowsMorosos = [
        ['Cliente', 'Mes', 'Monto', 'Fecha Vence', 'Estado', 'Notas'],
        ['Muebles Nuva', '2026-04-01', 6500000, '2026-04-15', 'DEBE', 'factura pendiente abril'],
        ['SunPartners', '2026-05-01', 7200000, '2026-05-15', 'DEBE', 'factura pendiente mayo'],
        ['Salsipuedes', '2026-05-01', 5400000, '2026-05-15', 'DEBE', 'cuenta vencida'],
        ['Colegio Las Américas', '2026-05-01', 4800000, '2026-05-15', 'DEBE', 'pendiente cobro'],
        ['Alestructurar', '2026-05-01', 5200000, '2026-05-15', 'DEBE', 'promesa de pago'],
        ['New Pueblito', '2026-05-01', 6100000, '2026-05-15', 'DEBE', 'pendiente transferencia'],
        ['Elvira Utria', '2026-05-01', 3555614, '2026-05-15', 'DEBE', 'saldo conciliado a pagar']
    ];
    const ws2_morosos = xlsx.utils.aoa_to_sheet(rowsMorosos);
    xlsx.utils.book_append_sheet(wb2, ws2_morosos, 'MOROSOS');

    // NOMINA sheet
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
    const ws2_nomina = xlsx.utils.aoa_to_sheet(rowsNomina);
    xlsx.utils.book_append_sheet(wb2, ws2_nomina, 'NOMINA');

    // AJUSTES_NOMINA sheet
    const rowsAjustes = [
        ['Colaborador/Email', 'Mes', 'Tipo', 'Monto', 'Descripción'],
        ['kamila.del.toro@brainstudio.com', '2026-01-01', 'BONUS', 500000, 'Bono por desempeño extraordinario'],
        ['francisco.villa@brainstudio.com', '2026-01-01', 'COMMISSION', 300000, 'Comisión de ventas']
    ];
    const ws2_ajustes = xlsx.utils.aoa_to_sheet(rowsAjustes);
    xlsx.utils.book_append_sheet(wb2, ws2_ajustes, 'AJUSTES_NOMINA');

    xlsx.writeFile(wb2, path.join(dataDir, 'FINANZAS_BRAIN_STUDIO_2026.xlsx'));
    console.log("Mock files written successfully.");
}

// Clean and standardize numeric values
function cleanNumber(val) {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return val;
    let cleaned = String(val).replace(/[$\.\s]/g, '').trim();
    cleaned = cleaned.replace(',', '.');
    return parseFloat(cleaned) || 0;
}

// Clean names/titles
function cleanString(val) {
    if (!val) return '';
    return String(val).trim().replace(/^"|"$/g, '');
}

// Map text to FinancialCategory
function mapExpenseCategory(concept) {
    const text = cleanString(concept).toUpperCase();
    if (text.includes('NOMINA') || text.includes('NÓMINA')) return 'NOMINA';
    if (text.includes('PAUTA') || text.includes('ADS')) return 'PAUTA';
    if (text.includes('LOGISTICA') || text.includes('LOGÍSTICA')) return 'LOGISTICA';
    if (text.includes('ADMINISTRATIVO') || text.includes('ADMINISTRA')) return 'ADMINISTRATIVO';
    if (text.includes('IMPUESTO') || text.includes('TAX') || text.includes('IVA') || text.includes('RETE')) return 'TAX';
    if (text.includes('FINANCIERO') || text.includes('BANCO') || text.includes('INTERES')) return 'FINANCIAL';
    return 'OPERATIVO';
}

// Sub-processor for horizontal financial columns
async function processHorizontalFinances(rows, hasDB) {
    if (rows.length < 2) return;

    const headers = rows[0];
    const columnsWithDates = [];

    // Map headers to Dates
    for (let i = 1; i < headers.length; i++) {
        const cell = headers[i];
        if (cell !== undefined && cell !== null && cell !== '') {
            const date = parseDate(cell);
            columnsWithDates.push({ colIndex: i, date });
        }
    }

    console.log(`Identified ${columnsWithDates.length} period columns.`);

    let currentType = 'INCOME'; // Default

    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const concept = cleanString(row[0]);
        if (!concept) continue;

        // Check if switching sections
        const normalizedConcept = concept.toUpperCase();
        if (normalizedConcept === 'INGRESOS' || normalizedConcept === 'INGRESOS BRUTOS' || normalizedConcept === 'ENTRADAS') {
            currentType = 'INCOME';
            console.log("Switching financial section context to: INCOME");
            continue;
        }
        if (normalizedConcept === 'EGRESOS' || normalizedConcept === 'EGRESOS TOTALES' || normalizedConcept === 'SALIDAS' || normalizedConcept === 'GASTOS') {
            currentType = 'EXPENSE';
            console.log("Switching financial section context to: EXPENSE");
            continue;
        }

        // Skip other summary or blank line triggers
        if (normalizedConcept.includes('TOTAL') || normalizedConcept.includes('MARGEN') || normalizedConcept.includes('UTILIDAD')) {
            continue;
        }

        if (currentType === 'INCOME') {
            // Upsert client and register income records
            const clientName = concept;
            const clientSlug = slugify(clientName);

            let clientId = 'mock-client-id';

            if (hasDB) {
                let client = await prisma.client.findUnique({ where: { slug: clientSlug } });
                if (!client) {
                    client = await prisma.client.create({
                        data: {
                            name: clientName,
                            slug: clientSlug,
                            status: 'ACTIVO',
                            logoUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(clientName)}&background=random&color=fff&size=128`
                        }
                    });
                    console.log(`Created client automatically: ${clientName}`);
                }
                clientId = client.id;
            }

            // Register each month's income
            let latestFee = 0;
            for (const col of columnsWithDates) {
                const amount = cleanNumber(row[col.colIndex]);
                if (amount > 0) {
                    latestFee = amount;
                    if (hasDB) {
                        await prisma.financialRecord.create({
                            data: {
                                amount,
                                category: 'MEMBRESIA',
                                type: 'INCOME',
                                date: col.date,
                                clientId,
                                description: `Membresía mensual: ${clientName}`
                            }
                        });
                    }
                }
            }

            // Update Client's monthly fee if any transactions were recorded
            if (latestFee > 0 && hasDB) {
                await prisma.client.update({
                    where: { id: clientId },
                    data: { monthlyFee: latestFee }
                });
            }

            console.log(`Parsed income for Client: ${clientName}, Latest Monthly Fee: ${latestFee}`);

        } else {
            // Register expense records
            const category = mapExpenseCategory(concept);
            let sumExpenses = 0;
            for (const col of columnsWithDates) {
                const amount = cleanNumber(row[col.colIndex]);
                if (amount > 0) {
                    sumExpenses += amount;
                    if (hasDB) {
                        await prisma.financialRecord.create({
                            data: {
                                amount,
                                category,
                                type: 'EXPENSE',
                                date: col.date,
                                description: `Gasto mensual: ${concept}`
                            }
                        });
                    }
                }
            }
            console.log(`Parsed expense category: ${category} (${concept}), Cumulative sum: ${sumExpenses}`);
        }
    }
}

// Sub-processor for accounts receivable (MOROSOS)
async function processMorosos(rows, hasDB) {
    if (rows.length < 2) return;

    // Detect header index mappings
    const headers = rows[0].map(h => cleanString(h).toUpperCase());
    const clientIdx = headers.indexOf('CLIENTE');
    const mesIdx = headers.indexOf('MES');
    const montoIdx = headers.indexOf('MONTO');
    const venceIdx = headers.indexOf('FECHA VENCE');
    const estadoIdx = headers.indexOf('ESTADO');
    const notasIdx = headers.indexOf('NOTAS');

    if (clientIdx === -1 || montoIdx === -1) {
        console.error("MOROSOS header missing critical columns 'Cliente' or 'Monto'.");
        return;
    }

    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const clientName = cleanString(row[clientIdx]);
        if (!clientName) continue;

        const amount = cleanNumber(row[montoIdx]);
        if (amount <= 0) continue;

        const clientSlug = slugify(clientName);
        let clientId = 'mock-client-id';

        if (hasDB) {
            let client = await prisma.client.findUnique({ where: { slug: clientSlug } });
            if (!client) {
                client = await prisma.client.create({
                    data: {
                        name: clientName,
                        slug: clientSlug,
                        status: 'ACTIVO',
                        logoUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(clientName)}&background=random&color=fff&size=128`
                    }
                });
                console.log(`Created client for Morosos: ${clientName}`);
            }
            clientId = client.id;
        }

        const period = mesIdx !== -1 ? parseDate(row[mesIdx]) : new Date();
        const dueDate = venceIdx !== -1 && row[venceIdx] ? parseDate(row[venceIdx]) : null;

        let status = 'DEBE';
        if (estadoIdx !== -1 && row[estadoIdx]) {
            const rawStatus = cleanString(row[estadoIdx]).toUpperCase();
            if (rawStatus === 'PAGADO') status = 'PAGADO';
            if (rawStatus === 'PROMESADO') status = 'PROMESADO';
        }

        const notes = notasIdx !== -1 ? cleanString(row[notasIdx]) : null;

        if (hasDB) {
            await prisma.accountsReceivable.create({
                data: {
                    clientId,
                    amount,
                    period,
                    dueDate,
                    status,
                    notes
                }
            });
        }
        console.log(`Registered Receivables: ${clientName} - Amount: ${amount}`);
    }
}

// Sub-processor for NOMINA (Payroll Contracts)
async function processNomina(rows, hasDB) {
    if (rows.length < 2) return;

    const headers = rows[0].map(h => cleanString(h).toUpperCase());
    const emailIdx = headers.indexOf('COLABORADOR/EMAIL');
    const salaryIdx = headers.indexOf('SALARIO BASE');
    const socSecIdx = headers.indexOf('SEGURIDAD SOCIAL');
    const startIdx = headers.indexOf('FECHA INICIO');
    const endIdx = headers.indexOf('FECHA FIN');

    if (emailIdx === -1 || salaryIdx === -1) {
        console.error("NOMINA header missing critical columns.");
        return;
    }

    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const email = cleanString(row[emailIdx]).toLowerCase();
        if (!email) continue;

        const baseSalary = cleanNumber(row[salaryIdx]);
        const socialSecurity = socSecIdx !== -1 ? cleanNumber(row[socSecIdx]) : 0;
        const startDate = startIdx !== -1 && row[startIdx] ? parseDate(row[startIdx]) : new Date('2021-01-01');
        const endDate = endIdx !== -1 && row[endIdx] ? parseDate(row[endIdx]) : null;

        if (hasDB) {
            // Lookup or create user
            let user = await prisma.user.findUnique({ where: { email } });
            if (!user) {
                // Generate clean human-readable names
                let name = email.split('@')[0].split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
                if (email === 'chrodny@gmail.com') name = 'Rodny';

                user = await prisma.user.create({
                    data: {
                        name,
                        email,
                        password: 'password_hashed_seeded',
                        role: email.includes('admin') || email.includes('rodny') || email.includes('villa') || email.includes('mestra') ? 'ADMIN' : 'EDITOR',
                        isActive: true,
                        hasFinancialAccess: email.includes('admin') || email.includes('rodny') || email.includes('villa') || email.includes('mestra')
                    }
                });
                console.log(`Seeded placeholder user: ${email}`);
            }

            await prisma.payrollContract.create({
                data: {
                    userId: user.id,
                    baseSalary,
                    socialSecurity,
                    startDate,
                    endDate
                }
            });
        }
        console.log(`Created Payroll Contract for: ${email}`);
    }
}

// Sub-processor for AJUSTES_NOMINA (Payroll Transactions/Adjustments)
async function processAjustesNomina(rows, hasDB) {
    if (rows.length < 2) return;

    const headers = rows[0].map(h => cleanString(h).toUpperCase());
    const emailIdx = headers.indexOf('COLABORADOR/EMAIL');
    const mesIdx = headers.indexOf('MES');
    const tipoIdx = headers.indexOf('TIPO');
    const montoIdx = headers.indexOf('MONTO');
    const descIdx = headers.indexOf('DESCRIPCIÓN');

    if (emailIdx === -1 || mesIdx === -1 || tipoIdx === -1 || montoIdx === -1) {
        console.error("AJUSTES_NOMINA header missing critical columns.");
        return;
    }

    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const email = cleanString(row[emailIdx]).toLowerCase();
        if (!email) continue;

        const amount = cleanNumber(row[montoIdx]);
        if (amount <= 0) continue;

        const periodDate = parseDate(row[mesIdx]);
        const month = periodDate.getMonth() + 1;
        const year = periodDate.getFullYear();

        let type = 'NOVELTY';
        const rawType = cleanString(row[tipoIdx]).toUpperCase();
        if (rawType === 'BONUS') type = 'BONUS';
        if (rawType === 'COMMISSION' || rawType === 'COMISION') type = 'COMMISSION';
        if (rawType === 'DEDUCTION' || rawType === 'DEDUCCION') type = 'DEDUCTION';

        const description = descIdx !== -1 ? cleanString(row[descIdx]) : null;

        if (hasDB) {
            // Lookup User
            let user = await prisma.user.findUnique({ where: { email } });
            if (!user) {
                // Generate clean human-readable names
                let name = email.split('@')[0].split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
                if (email === 'chrodny@gmail.com') name = 'Rodny';

                user = await prisma.user.create({
                    data: {
                        name,
                        email,
                        password: 'password_hashed_seeded',
                        role: email.includes('admin') || email.includes('rodny') || email.includes('villa') || email.includes('mestra') ? 'ADMIN' : 'EDITOR',
                        isActive: true,
                        hasFinancialAccess: email.includes('admin') || email.includes('rodny') || email.includes('villa') || email.includes('mestra')
                    }
                });
                console.log(`Seeded placeholder user for Adjustments: ${email}`);
            }

            // Get contract
            let contract = await prisma.payrollContract.findFirst({
                where: { userId: user.id },
                orderBy: { startDate: 'desc' }
            });

            if (!contract) {
                contract = await prisma.payrollContract.create({
                    data: {
                        userId: user.id,
                        baseSalary: 3000000,
                        socialSecurity: 400000,
                        startDate: new Date('2021-01-01')
                    }
                });
                console.log(`Seeded default contract for: ${email}`);
            }

            // Get/Create Transaction
            let tx = await prisma.payrollTransaction.findUnique({
                where: { userId_month_year: { userId: user.id, month, year } }
            });

            if (!tx) {
                tx = await prisma.payrollTransaction.create({
                    data: {
                        userId: user.id,
                        contractId: contract.id,
                        month,
                        year,
                        paidAt: new Date(year, month - 1, 28) // Default to 28th of the month
                    }
                });
            }

            await prisma.payrollAdjustment.create({
                data: {
                    transactionId: tx.id,
                    type,
                    amount,
                    description
                }
            });
        }
        console.log(`Added Payroll Adjustment: ${email} - Type: ${type} - Amount: ${amount}`);
    }
}

async function seedFinancials() {
    console.log("--- INICIANDO PROCESO DE SEMBRADO FINANCIERO MASIVO (2021-2026) ---");

    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    const file2026Local = path.join(dataDir, 'FINANZAS_BRAIN_STUDIO_2026.xlsx');
    const fileHistLocal = path.join(dataDir, 'FINANZAS_BRAIN_STUDIO_2021_2025.xlsx');

    // Try S3 first
    let s3Success = false;
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        const d1 = await downloadFromS3('Financials/FINANZAS BRAIN STUDIO 2026.xlsx', file2026Local);
        const d2 = await downloadFromS3('Financials/FINANZAS BRAIN STUDIO 2021- 2025.xlsx', fileHistLocal);
        s3Success = d1 && d2;
    }

    // Fallback to auto-generating mocks if not present and S3 failed
    if (!s3Success && (!fs.existsSync(file2026Local) || !fs.existsSync(fileHistLocal))) {
        generateMockExcels(dataDir);
    }

    // Verify files exist before parsing
    if (!fs.existsSync(file2026Local) || !fs.existsSync(fileHistLocal)) {
        console.error("Critical Error: Financial Excel files not found.");
        process.exit(1);
    }

    const hasDB = !!process.env.DATABASE_URL;
    if (!hasDB) {
        console.warn("WARNING: DATABASE_URL not found. Skipping live database mutations (purge/insert), but running full local Excel parser dry-run for validation!");
    }

    try {
        if (hasDB) {
            // Clear previous financials and payroll data for seed clean-state
            console.log("Purging old financial/payroll tables for safe seed...");
            await prisma.payrollAdjustment.deleteMany({});
            await prisma.payrollTransaction.deleteMany({});
            await prisma.payrollContract.deleteMany({});
            await prisma.accountsReceivable.deleteMany({});
            await prisma.financialRecord.deleteMany({});
        }

        // --- STEP 1: PARSE HISTORICAL EXCEL (2021-2025) ---
        console.log(`Loading historical workbook from ${fileHistLocal}...`);
        const wbHist = xlsx.readFile(fileHistLocal);
        const wsHist = wbHist.Sheets['Resumen BRAIN AÑOS'] || wbHist.Sheets[wbHist.SheetNames[0]];
        const rowsHist = xlsx.utils.sheet_to_json(wsHist, { header: 1 });

        console.log(`Parsed ${rowsHist.length} rows from historical sheet.`);
        await processHorizontalFinances(rowsHist, hasDB);

        // --- STEP 2: PARSE 2026 FINANCES EXCEL ---
        console.log(`Loading 2026 workbook from ${file2026Local}...`);
        const wb2026 = xlsx.readFile(file2026Local);

        // Parse 2026 main sheet
        const ws2026Main = wb2026.Sheets['FINANZAS BRAIN STUDIO 2026'] || wb2026.Sheets[wb2026.SheetNames[0]];
        const rows2026Main = xlsx.utils.sheet_to_json(ws2026Main, { header: 1 });
        console.log(`Parsed ${rows2026Main.length} rows from 2026 finances.`);
        await processHorizontalFinances(rows2026Main, hasDB);

        // Parse MOROSOS
        const wsMorosos = wb2026.Sheets['MOROSOS'];
        if (wsMorosos) {
            const rowsMorosos = xlsx.utils.sheet_to_json(wsMorosos, { header: 1 });
            console.log(`Parsed ${rowsMorosos.length} rows from MOROSOS.`);
            await processMorosos(rowsMorosos, hasDB);
        } else {
            console.warn("WARNING: Sheet 'MOROSOS' not found in 2026 Excel.");
        }

        // Parse NOMINA
        const wsNomina = wb2026.Sheets['NOMINA'];
        if (wsNomina) {
            const rowsNomina = xlsx.utils.sheet_to_json(wsNomina, { header: 1 });
            console.log(`Parsed ${rowsNomina.length} rows from NOMINA.`);
            await processNomina(rowsNomina, hasDB);
        } else {
            console.warn("WARNING: Sheet 'NOMINA' not found in 2026 Excel.");
        }

        // Parse AJUSTES_NOMINA
        const wsAjustes = wb2026.Sheets['AJUSTES_NOMINA'];
        if (wsAjustes) {
            const rowsAjustes = xlsx.utils.sheet_to_json(wsAjustes, { header: 1 });
            console.log(`Parsed ${rowsAjustes.length} rows from AJUSTES_NOMINA.`);
            await processAjustesNomina(rowsAjustes, hasDB);
        } else {
            console.warn("WARNING: Sheet 'AJUSTES_NOMINA' not found in 2026 Excel.");
        }

        console.log("--- PROCESO DE SEMBRADO COMPLETADO EXITOSAMENTE ---");
    } catch (err) {
        console.error("CRITICAL SEED ERROR:", err);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

seedFinancials();
