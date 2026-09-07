import { readFile, open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { planCalendarDuplicateRepair, applyCalendarDuplicateRepair, revertCalendarDuplicateRepair } from '../src/services/calendarDuplicateRepair.js';

export function parseCalendarRepairArguments(args = []) {
  const result = { apply: false, plan: null, receipt: null, revert: null, help: false };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--apply') result.apply = true;
    else if (argument === '--dry-run') result.apply = false;
    else if (argument === '--help') result.help = true;
    else if (['--plan', '--receipt', '--revert'].includes(argument)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Falta el archivo para ${argument}`);
      result[argument.slice(2)] = resolve(value);
    } else throw new Error(`Argumento no reconocido: ${argument}`);
  }
  if (!result.help && result.apply && !result.revert && (!result.plan || !result.receipt)) throw new Error('--apply exige --plan revisado y --receipt nuevo para permitir recuperación.');
  if (result.revert && result.plan) throw new Error('--revert y --plan son excluyentes.');
  if (result.plan && result.receipt === result.plan) throw new Error('--receipt debe ser distinto al plan.');
  return result;
}

const help = `Reparación local conservadora de duplicados Google Calendar.
Requiere DATABASE_URL y el bootstrap de calendario ya desplegado. No llama Google.

Vista previa, sin escrituras:
  node scripts/repair-calendar-duplicates.js > calendar-repair-plan.json

Aplicar únicamente el plan revisado y guardar recibo antes del commit:
  node scripts/repair-calendar-duplicates.js --apply --plan calendar-repair-plan.json --receipt calendar-repair-receipt.json

Revertir una reparación sin cambios posteriores (no recrea ni borra eventos):
  node scripts/repair-calendar-duplicates.js --apply --revert calendar-repair-receipt.json

Sin --apply nunca se modifican registros. --receipt debe ser un archivo nuevo.
Los planes y recibos contienen solo IDs, conteos, códigos y huellas.`;

async function requireRepairSchema(db) {
  const columns = await db.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='OperationalEvent' AND column_name IN ('googleCancelled','requestId','requestHash','googleSyncAttempts','googleNextRetryAt','googleRecurringEventId','googleOriginalStartAt','googleTimeZone')`);
  if (columns.length !== 8) throw Object.assign(new Error('Primero debe desplegarse el bootstrap aditivo de calendario; este script no modifica el esquema.'), { code: 'CALENDAR_REPAIR_SCHEMA_REQUIRED' });
}

export async function runCalendarDuplicateRepair(args = process.argv.slice(2)) {
  const options = parseCalendarRepairArguments(args);
  if (options.help) return { help };
  const dotenv = await import('dotenv');
  dotenv.config({ quiet: true });
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es obligatoria.');
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();
  let receiptFile;
  try {
    await requireRepairSchema(db);
    if (!options.apply) {
      return await db.$transaction(async tx => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        return planCalendarDuplicateRepair(await tx.operationalEvent.findMany({ where: { source: 'GOOGLE' }, include: { googleLinks: true }, orderBy: { id: 'asc' } }));
      }, { isolationLevel: 'RepeatableRead', timeout: 30000 });
    }
    if (options.revert) return await revertCalendarDuplicateRepair(JSON.parse(await readFile(options.revert, 'utf8')), { db });
    const plan = JSON.parse(await readFile(options.plan, 'utf8'));
    receiptFile = await open(options.receipt, 'wx', 0o600);
    return await applyCalendarDuplicateRepair(plan, { db, persistReceipt: async receipt => {
      await receiptFile.writeFile(JSON.stringify(receipt, null, 2) + '\n');
      await receiptFile.sync();
    } });
  } finally {
    await receiptFile?.close();
    await db.$disconnect();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runCalendarDuplicateRepair().then(result => console.log(result.help || JSON.stringify(result, null, 2))).catch(error => {
    const safeMessage = String(error.code || '').startsWith('CALENDAR_REPAIR_') || error.code === 'GOOGLE_CALENDAR_BUSY'
      ? error.message : 'No se completó la operación; verifica argumentos, archivos, esquema y conexión.';
    console.error(JSON.stringify({ error: safeMessage, code: error.code || 'CALENDAR_REPAIR_FAILED' }));
    process.exitCode = 1;
  });
}
