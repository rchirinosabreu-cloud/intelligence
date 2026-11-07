import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { financialCorrectionDatabase } from './support/financialCorrectionDatabase.js';
import { ensureBarterBeneficiaries } from '../scripts/ensure-barter-beneficiaries-schema.js';

test('ensure aditivo repetible conserva canjes legados y protege los vínculos', { skip: !briaTestDatabaseUrl(), timeout: 90000 }, async () => {
  const f = await financialCorrectionDatabase({ additionalTables: ['AccountsReceivable', 'ReceivablePayment'] });
  const url = new URL(f.databaseUrl), schema = url.searchParams.get('schema'); url.searchParams.delete('schema');
  const connection = new pg.Client({ connectionString: url.href });
  try {
    await connection.connect(); await connection.query(`SET search_path TO "${schema}"`);
    await connection.query(`ALTER TABLE "AccountsReceivable" DROP COLUMN "barterPaymentId", DROP COLUMN "beneficiaryThirdPartyId"`);
    await connection.query(`INSERT INTO "AccountsReceivable" (id,amount,period,"updatedAt") VALUES ('old-ar',1000,'2026-11-01',now())`);
    await connection.query(`INSERT INTO "ReceivablePayment" (id,"receivableId",amount,"paidAt",kind,detail,"updatedAt") VALUES ('old-payment','old-ar',500,'2026-11-03','CANJE','{"destination":"texto anterior"}',now())`);
    await ensureBarterBeneficiaries(connection); await ensureBarterBeneficiaries(connection);
    assert.equal((await connection.query(`SELECT "barterPaymentId" FROM "AccountsReceivable" WHERE id='old-ar'`)).rows[0].barterPaymentId, null);
    assert.equal((await connection.query(`SELECT detail FROM "ReceivablePayment" WHERE id='old-payment'`)).rows[0].detail.destination, 'texto anterior');
    await connection.query(`INSERT INTO "ThirdParty" (id,kind,name,"updatedAt") VALUES ('party','SOCIO','Persona',now())`);
    await connection.query(`INSERT INTO "AccountsReceivable" (id,amount,period,"updatedAt",kind,"barterPaymentId","beneficiaryThirdPartyId") VALUES ('beneficiary',500,'2026-11-01',now(),'BENEFICIARIO','old-payment','party')`);
    await assert.rejects(connection.query(`DELETE FROM "ReceivablePayment" WHERE id='old-payment'`), e => e.code === '23503');
    await assert.rejects(connection.query(`DELETE FROM "ThirdParty" WHERE id='party'`), e => e.code === '23503');
    await assert.rejects(connection.query(`UPDATE "AccountsReceivable" SET "barterPaymentId"='old-payment' WHERE id='old-ar'`), e => e.code === '23505');
  } finally { await connection.end(); await f.close(); }
});
