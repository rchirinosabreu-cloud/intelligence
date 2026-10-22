#!/usr/bin/env node
// Lleva a Cartera los préstamos que ya estaban en Movimientos (Rodny, 20 de octubre de 2026:
// «los registros que ya tenía como préstamos, no se actualizan en cuenta por cobrar?»).
//
// Busca los egresos reales de categoría PRESTAMO que no tienen préstamo en Cartera ni son de
// otra operación y crea su cuenta por cobrar con la misma regla que usa Movimientos al registrar
// uno nuevo (`syncLoanWithRecord`). Simula por defecto; escribe solo con `--confirmar LIGAR`.
//
//   node scripts/link-loan-records.js                    # muestra qué haría
//   node scripts/link-loan-records.js --confirmar LIGAR  # crea los préstamos en Cartera
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { loanFromRecord } from '../src/lib/receivableLoans.js';
import { syncLoanWithRecord } from '../src/services/loanRecordSyncService.js';

const confirm = process.argv.includes('--confirmar') && process.argv[process.argv.indexOf('--confirmar') + 1] === 'LIGAR';
const prisma = new PrismaClient();

const money = (value) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value));
const day = (value) => new Date(value).toISOString().slice(0, 10);

try {
    const records = await prisma.financialRecord.findMany({
        where: {
            type: 'EXPENSE', category: 'PRESTAMO', status: 'POSTED', scenario: 'ACTUAL', isProjection: false,
            loanReceivable: { is: null }, receivablePayment: { is: null }, payrollTransaction: { is: null }, payrollPayment: { is: null }
        },
        include: { client: { select: { id: true, name: true } } },
        orderBy: { date: 'asc' }
    });
    const candidates = records.filter((record) => loanFromRecord(record));
    if (!candidates.length) {
        console.log('No hay egresos de préstamo sin cuenta por cobrar. Nada que hacer.');
    } else {
        console.log(`${candidates.length} egreso(s) de préstamo sin cuenta por cobrar:`);
        for (const record of candidates) {
            const loan = loanFromRecord(record);
            console.log(`  - ${day(record.date)}  ${money(record.amount).padStart(14)}  ${record.origin.padEnd(8)}  «${record.description || ''}» → préstamo a ${loan.counterpartyName}${record.client ? ` (cliente ${record.client.name})` : ''}`);
        }
        if (!confirm) {
            console.log('\nSimulación: no se escribió nada. Para crearlos en Cartera: node scripts/link-loan-records.js --confirmar LIGAR');
        } else {
            let created = 0;
            for (const record of candidates) {
                const result = await prisma.$transaction((tx) => syncLoanWithRecord(tx, { ...record, loanReceivable: null }, { actorId: null }), { isolationLevel: 'Serializable' });
                if (result.action === 'CREATED') {
                    created += 1;
                    console.log(`  ✔ ${record.id} → préstamo ${result.receivable.id} (${result.receivable.counterpartyType}: ${result.receivable.counterpartyName})`);
                }
            }
            console.log(`\nListo: ${created} préstamo(s) creados en Cartera.`);
        }
    }
} finally {
    await prisma.$disconnect();
}
