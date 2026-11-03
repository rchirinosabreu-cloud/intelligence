import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFinancialAccount,
  listFinancialAccounts,
  updateFinancialAccount
} from '../src/services/financialAccountService.js';

/** Doble de Prisma que recuerda lo que se escribió y de qué cuenta se partía. */
const accountDouble = (existing = null) => {
  const calls = [];
  const tx = {
    financialAccount: {
      findUnique: async ({ where }) => {
        calls.push(['account.findUnique', where]);
        return existing;
      },
      create: async ({ data }) => {
        calls.push(['account.create', data]);
        return { id: 'account-1', ...data };
      },
      update: async ({ where, data }) => {
        calls.push(['account.update', { where, data }]);
        return { ...existing, ...data };
      }
    },
    financialAuditEvent: {
      create: async ({ data }) => {
        calls.push(['audit.create', data]);
        return { id: 'audit-1' };
      }
    }
  };
  return { calls, prismaClient: { $transaction: async (callback) => callback(tx) } };
};

const written = (calls, name) => calls.find(([call]) => call === name)?.[1];

test('createFinancialAccount normalizes the account and writes an audit event atomically', async () => {
  const calls = [];
  const tx = {
    financialAccount: {
      create: async ({ data }) => {
        calls.push(['account.create', data]);
        return { id: 'account-1', ...data };
      }
    },
    financialAuditEvent: {
      create: async ({ data }) => {
        calls.push(['audit.create', data]);
        return { id: 'audit-1' };
      }
    }
  };
  const prismaClient = { $transaction: async (callback) => callback(tx) };

  const account = await createFinancialAccount(prismaClient, {
    name: ' Bancolombia ',
    type: 'bank',
    openingBalance: '1250000',
    openingBalanceDate: '2026-01-01'
  }, { id: 'user-1' });

  assert.equal(account.name, 'Bancolombia');
  assert.equal(account.type, 'BANK');
  assert.equal(account.openingBalance, 1250000);
  assert.equal(calls.find(([name]) => name === 'audit.create')[1].actorId, 'user-1');
});

test('listFinancialAccounts calculates posted actual balances only', async () => {
  const prismaClient = {
    financialAccount: {
      findMany: async () => [{
        id: 'account-1',
        name: 'Caja',
        type: 'CASH',
        currency: 'COP',
        openingBalance: 1000,
        openingBalanceDate: new Date('2026-01-01T12:00:00.000Z'),
        isActive: true,
        records: [
          { type: 'INCOME', amount: 500, date: new Date('2026-01-02T12:00:00.000Z') },
          { type: 'EXPENSE', amount: 200, date: new Date('2026-01-03T12:00:00.000Z') }
        ]
      }]
    }
  };

  const accounts = await listFinancialAccounts(prismaClient);
  assert.equal(accounts[0].balance, 1300);
});

test('createFinancialAccount conserva de quién es la cuenta y cómo identificarla', async () => {
  const { calls, prismaClient } = accountDouble();

  const account = await createFinancialAccount(prismaClient, {
    name: 'Wise',
    type: 'BANK',
    institution: ' Wise ',
    holderName: ' Francisco Alberto Villa Zuñiga ',
    holderType: 'person',
    identificationType: 'cc',
    identificationNumber: ' 73.123.456 ',
    lastFour: '0345',
    isThirdPartyHeld: true,
    openingBalance: '2500000',
    openingBalanceDate: '2026-11-03'
  }, { id: 'user-1' });

  assert.equal(account.institution, 'Wise');
  assert.equal(account.holderName, 'Francisco Alberto Villa Zuñiga');
  assert.equal(account.holderType, 'PERSON');
  assert.equal(account.identificationType, 'CC');
  // El documento se guarda como lo escribió la persona: «arreglarlo» introduce errores.
  assert.equal(account.identificationNumber, '73.123.456');
  assert.equal(account.lastFour, '0345');
  assert.equal(account.isThirdPartyHeld, true);
  assert.equal(written(calls, 'account.create').currency, 'COP');
});

test('createFinancialAccount deja vacío lo que no se dijo, sin inventar titular', async () => {
  const { prismaClient } = accountDouble();

  const account = await createFinancialAccount(prismaClient, {
    name: 'Caja menor',
    type: 'CASH',
    openingBalanceDate: '2026-01-01'
  }, { id: 'user-1' });

  assert.equal(account.institution, null);
  assert.equal(account.holderName, null);
  assert.equal(account.lastFour, null);
  assert.equal(account.holderType, 'COMPANY');
  assert.equal(account.isThirdPartyHeld, false);
});

test('createFinancialAccount nace en pesos aunque pidan otra moneda', async () => {
  const { calls, prismaClient } = accountDouble();

  // Una cuenta de Wise es en dólares, pero ningún total del módulo lee la moneda:
  // guardarla en USD sumaría dólares con pesos. Se registra convertido.
  await createFinancialAccount(prismaClient, {
    name: 'Wise', type: 'BANK', currency: 'USD', openingBalanceDate: '2026-11-03'
  }, { id: 'user-1' });

  assert.equal(written(calls, 'account.create').currency, 'COP');
});

test('createFinancialAccount exige cuatro dígitos en los últimos dígitos', async () => {
  const { prismaClient } = accountDouble();
  await assert.rejects(
    createFinancialAccount(prismaClient, {
      name: 'Wise', type: 'BANK', lastFour: '34', openingBalanceDate: '2026-01-01'
    }, { id: 'user-1' }),
    (error) => error.code === 'FINANCIAL_ACCOUNT_LAST_FOUR_INVALID'
  );
});

test('createFinancialAccount descarta un documento a medias en vez de guardarlo roto', async () => {
  const { prismaClient } = accountDouble();

  const account = await createFinancialAccount(prismaClient, {
    name: 'Wise', type: 'BANK', identificationType: 'CC', identificationNumber: '',
    openingBalanceDate: '2026-01-01'
  }, { id: 'user-1' });

  assert.equal(account.identificationType, null);
  assert.equal(account.identificationNumber, null);
});

test('createFinancialAccount pide de quién es una cuenta que no es de la empresa', async () => {
  const { prismaClient } = accountDouble();
  await assert.rejects(
    createFinancialAccount(prismaClient, {
      name: 'Wise', type: 'BANK', isThirdPartyHeld: true, openingBalanceDate: '2026-01-01'
    }, { id: 'user-1' }),
    (error) => error.code === 'FINANCIAL_ACCOUNT_HOLDER_REQUIRED'
  );
});

test('createFinancialAccount explica un nombre repetido en vez de soltar el error de la base', async () => {
  const prismaClient = {
    $transaction: async (callback) => callback({
      financialAccount: {
        create: async () => {
          const error = new Error('Unique constraint failed');
          error.code = 'P2002';
          throw error;
        }
      }
    })
  };

  await assert.rejects(
    createFinancialAccount(prismaClient, { name: 'Wise', type: 'BANK', openingBalanceDate: '2026-01-01' }, { id: 'user-1' }),
    (error) => error.code === 'FINANCIAL_ACCOUNT_NAME_TAKEN' && error.message.includes('Wise')
  );
});

test('updateFinancialAccount corrige la cuenta y guarda el antes y el después', async () => {
  const existing = {
    id: 'account-1', name: 'Wise', type: 'BANK', currency: 'COP', isActive: true,
    institution: null, holderName: null, holderType: 'COMPANY',
    identificationType: null, identificationNumber: null, lastFour: null, isThirdPartyHeld: false,
    openingBalance: 0, openingBalanceDate: new Date('2026-11-03T12:00:00.000Z')
  };
  const { calls, prismaClient } = accountDouble(existing);

  const account = await updateFinancialAccount(prismaClient, 'account-1', {
    name: 'Wise · dólares',
    type: 'BANK',
    institution: 'Wise',
    holderName: 'Francisco Alberto Villa Zuñiga',
    holderType: 'PERSON',
    isThirdPartyHeld: true,
    openingBalance: '2500000',
    openingBalanceDate: '2026-11-03'
  }, { id: 'user-1' });

  assert.equal(account.name, 'Wise · dólares');
  assert.equal(account.institution, 'Wise');
  const audit = written(calls, 'audit.create');
  assert.equal(audit.action, 'UPDATE');
  assert.equal(audit.before.name, 'Wise');
  assert.equal(audit.after.name, 'Wise · dólares');
  assert.equal(audit.actorId, 'user-1');
});

test('updateFinancialAccount no apaga una cuenta ni le cambia la moneda', async () => {
  const existing = {
    id: 'account-1', name: 'Wise', type: 'BANK', currency: 'COP', isActive: true,
    openingBalance: 0, openingBalanceDate: new Date('2026-11-03T12:00:00.000Z')
  };
  const { calls, prismaClient } = accountDouble(existing);

  await updateFinancialAccount(prismaClient, 'account-1', {
    name: 'Wise', type: 'BANK', isActive: false, currency: 'USD', openingBalanceDate: '2026-11-03'
  }, { id: 'user-1' });

  const data = written(calls, 'account.update').data;
  assert.equal('isActive' in data, false);
  assert.equal('currency' in data, false);
});

test('updateFinancialAccount avisa cuando la cuenta ya no existe', async () => {
  const { prismaClient } = accountDouble(null);
  await assert.rejects(
    updateFinancialAccount(prismaClient, 'account-404', {
      name: 'Wise', type: 'BANK', openingBalanceDate: '2026-01-01'
    }, { id: 'user-1' }),
    (error) => error.code === 'FINANCIAL_ACCOUNT_NOT_FOUND' && error.statusCode === 404
  );
});

test('createFinancialAccount rejects unsupported account types', async () => {
  await assert.rejects(
    createFinancialAccount({ $transaction: async () => null }, {
      name: 'Tarjeta',
      type: 'CREDIT',
      openingBalanceDate: '2026-01-01'
    }, { id: 'user-1' }),
    (error) => error.code === 'FINANCIAL_ACCOUNT_TYPE_INVALID'
  );
});
