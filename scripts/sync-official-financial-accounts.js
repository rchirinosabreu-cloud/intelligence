import { PrismaClient } from '@prisma/client';
import { createFinancialAccount } from '../src/services/financialAccountService.js';

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');

const officialAccounts = [
  {
    name: 'Bancolombia ahorros \u00b7 0345',
    type: 'BANK',
    currency: 'COP',
    openingBalance: 0,
    openingBalanceDate: '2026-01-01',
    institution: 'Bancolombia',
    holderName: 'FRANCISCO ALBERTO VILLA ZU\u00d1IGA',
    holderType: 'PERSON',
    identificationType: 'CC',
    identificationNumber: '1235038569',
    lastFour: '0345'
  },
  {
    name: 'Bancolombia ahorros \u00b7 3251',
    type: 'BANK',
    currency: 'COP',
    openingBalance: 0,
    openingBalanceDate: '2026-01-01',
    institution: 'Bancolombia',
    holderName: 'BRAIN STUDIO AGENCIA CREATIVA S.A.S',
    holderType: 'COMPANY',
    identificationType: 'NIT',
    identificationNumber: '901533409-4',
    lastFour: '3251'
  }
];

try {
  const existing = await prisma.financialAccount.findMany({
    where: { OR: officialAccounts.map(({ name, currency }) => ({ name, currency })) },
    orderBy: { name: 'asc' }
  });
  const existingNames = new Set(existing.map(({ name, currency }) => `${name}:${currency}`));
  const missing = officialAccounts.filter(({ name, currency }) => !existingNames.has(`${name}:${currency}`));

  if (shouldApply) {
    for (const account of missing) await createFinancialAccount(prisma, account, null);
  }

  console.log(JSON.stringify({ mode: shouldApply ? 'aplicar' : 'comprobar', existing, missing, created: shouldApply ? missing.length : 0 }, null, 2));
} finally {
  await prisma.$disconnect();
}
