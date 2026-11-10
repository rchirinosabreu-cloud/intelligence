import pg from 'pg';
import { pathToFileURL } from 'node:url';
export async function ensureFinancialPerson(db) {
  for (const table of ['FinancialCollaborator','AccountsReceivable']) {
    await db.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "thirdPartyId" TEXT REFERENCES "ThirdParty"(id) ON DELETE RESTRICT`);
    await db.query(`CREATE INDEX IF NOT EXISTS "${table}_thirdPartyId_idx" ON "${table}"("thirdPartyId")`);
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const db=new pg.Client({connectionString:process.env.DATABASE_URL});
  try{await db.connect();await ensureFinancialPerson(db);console.log('Identidad financiera: esquema listo; sin modificar registros.');}
  finally{await db.end();}
}
