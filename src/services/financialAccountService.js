import {
  FinancialDomainError,
  parseFinancialDateInput
} from './financialRecordService.js';
import { partyDocumentType } from '../lib/partyIdentity.js';

const ACCOUNT_TYPES = new Set(['BANK', 'CASH', 'OTHER']);
const HOLDER_TYPES = new Set(['COMPANY', 'PERSON']);
// Son los cuatro últimos dígitos con que se reconoce una cuenta en un extracto.
// Menos de cuatro no identifica nada, así que es cuatro o está vacío.
const LAST_FOUR = /^\d{4}$/;

const toNumber = (value) => {
  if (value && typeof value.toNumber === 'function') return value.toNumber();
  return Number(value) || 0;
};

const actorIdFrom = (actor) => actor?.id || actor?.userId || null;

const optionalText = (value) => {
  const text = String(value ?? '').trim();
  return text || null;
};

const plain = (value) => JSON.parse(JSON.stringify(value));

/**
 * Lo que identifica una cuenta: su nombre, de quién es y cómo reconocerla en un
 * extracto. Todo lo que no sea el nombre, el tipo y el saldo inicial es opcional:
 * una caja menor no tiene institución ni titular. Lo que no se dijo queda vacío,
 * nunca se deduce.
 */
const normalizeAccountInput = (input = {}) => {
  const name = String(input.name || '').trim();
  if (!name) {
    throw new FinancialDomainError('FINANCIAL_ACCOUNT_NAME_REQUIRED', 'El nombre de la cuenta es obligatorio.');
  }

  const type = String(input.type || '').trim().toUpperCase();
  if (!ACCOUNT_TYPES.has(type)) {
    throw new FinancialDomainError('FINANCIAL_ACCOUNT_TYPE_INVALID', 'El tipo de cuenta no es válido.');
  }

  const holderType = String(input.holderType || 'COMPANY').trim().toUpperCase();
  if (!HOLDER_TYPES.has(holderType)) {
    throw new FinancialDomainError('FINANCIAL_ACCOUNT_HOLDER_TYPE_INVALID', 'El titular es una empresa o una persona.');
  }

  const lastFour = optionalText(input.lastFour);
  if (lastFour && !LAST_FOUR.test(lastFour)) {
    throw new FinancialDomainError('FINANCIAL_ACCOUNT_LAST_FOUR_INVALID', 'Los últimos dígitos son cuatro números, por ejemplo 0345.');
  }

  const holderName = optionalText(input.holderName);
  const isThirdPartyHeld = input.isThirdPartyHeld === true || input.isThirdPartyHeld === 'true';
  if (isThirdPartyHeld && !holderName) {
    throw new FinancialDomainError('FINANCIAL_ACCOUNT_HOLDER_REQUIRED', 'Si la cuenta no es de Brain Studio, escribe a nombre de quién está.');
  }

  // El documento va entero o no va, como en la ficha del cliente: tipo sin número
  // no identifica a nadie y después va impreso.
  const identificationNumber = optionalText(input.identificationNumber);
  const documentType = identificationNumber ? partyDocumentType(input.identificationType) : null;
  if (identificationNumber && !documentType) {
    throw new FinancialDomainError('FINANCIAL_ACCOUNT_DOCUMENT_TYPE_INVALID', 'Elige el tipo de documento del titular.');
  }

  const openingBalance = Number(input.openingBalance || 0);
  if (!Number.isFinite(openingBalance)) {
    throw new FinancialDomainError('FINANCIAL_ACCOUNT_BALANCE_INVALID', 'El saldo inicial no es válido.');
  }

  const { date: openingBalanceDate } = parseFinancialDateInput(input.openingBalanceDate);
  return {
    name,
    type,
    institution: optionalText(input.institution),
    holderName,
    holderType,
    identificationType: documentType ? documentType.value : null,
    identificationNumber: documentType ? identificationNumber : null,
    lastFour,
    isThirdPartyHeld,
    openingBalance,
    openingBalanceDate
  };
};

/** Un nombre repetido es un choque con la llave única; se dice en español. */
const asDomainError = (error, name) => {
  if (error?.code === 'P2002') {
    return new FinancialDomainError(
      'FINANCIAL_ACCOUNT_NAME_TAKEN',
      `Ya existe una cuenta llamada «${name}». Ponle otro nombre o corrige la que ya está.`,
      409
    );
  }
  return error;
};

export const createFinancialAccount = async (prismaClient, input, actor) => {
  const data = normalizeAccountInput(input);
  const actorId = actorIdFrom(actor);

  try {
    return await prismaClient.$transaction(async (tx) => {
      // Siempre en pesos, aunque la cuenta real sea en dólares: ningún total del
      // módulo lee la moneda, así que una cuenta en otra divisa sumaría dólares con
      // pesos sin que nadie lo note. Lo que entra se registra convertido, como las
      // cuentas de cobro en USD.
      const account = await tx.financialAccount.create({ data: { ...data, currency: 'COP', isActive: input.isActive !== false } });
      await tx.financialAuditEvent.create({
        data: {
          entityType: 'FinancialAccount',
          entityId: account.id,
          action: 'CREATE',
          after: plain(account),
          actorId
        }
      });
      return account;
    });
  } catch (error) {
    throw asDomainError(error, data.name);
  }
};

/**
 * Corregir una cuenta ya creada: el nombre mal escrito, la institución que faltaba,
 * de quién es. No toca `isActive` ni la moneda a propósito: apagar una cuenta la
 * sacaría de la lista sin forma de volver a encenderla desde la pantalla, y la
 * moneda es parte de su llave única.
 */
export const updateFinancialAccount = async (prismaClient, accountId, input, actor) => {
  const id = String(accountId || '').trim();
  if (!id) {
    throw new FinancialDomainError('FINANCIAL_ACCOUNT_NOT_FOUND', 'No encontramos esa cuenta.', 404);
  }
  const data = normalizeAccountInput(input);
  const actorId = actorIdFrom(actor);

  try {
    return await prismaClient.$transaction(async (tx) => {
      const before = await tx.financialAccount.findUnique({ where: { id } });
      if (!before) {
        throw new FinancialDomainError('FINANCIAL_ACCOUNT_NOT_FOUND', 'No encontramos esa cuenta.', 404);
      }
      const account = await tx.financialAccount.update({ where: { id }, data });
      await tx.financialAuditEvent.create({
        data: {
          entityType: 'FinancialAccount',
          entityId: id,
          action: 'UPDATE',
          before: plain(before),
          after: plain(account),
          actorId
        }
      });
      return account;
    });
  } catch (error) {
    throw asDomainError(error, data.name);
  }
};

export const listFinancialAccounts = async (prismaClient, { includeInactive = false } = {}) => {
  const accounts = await prismaClient.financialAccount.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: {
      records: {
        where: {
          status: 'POSTED',
          scenario: 'ACTUAL'
        },
        select: { type: true, amount: true, date: true }
      }
    }
  });

  return accounts.map(({ records, ...account }) => {
    // These are accounting dates, not event timestamps: legacy imports use UTC
    // midnight and manual entries use noon. Both belong to the same ledger day.
    const openingDate = new Date(account.openingBalanceDate);
    const openingDayStart = Date.UTC(openingDate.getUTCFullYear(), openingDate.getUTCMonth(), openingDate.getUTCDate());
    const movementBalance = records.reduce((sum, record) => {
      if (new Date(record.date).getTime() < openingDayStart) return sum;
      const signedAmount = record.type === 'INCOME' ? toNumber(record.amount) : -toNumber(record.amount);
      return sum + signedAmount;
    }, 0);

    return {
      ...account,
      balance: toNumber(account.openingBalance) + movementBalance
    };
  });
};
