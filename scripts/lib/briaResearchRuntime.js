import { readFile } from 'node:fs/promises';
import dotenv from 'dotenv';

// Read only the configured runtime values; never copy the environment into the corpus or browser.
export const loadResearchConfig = async file => {
  const parsed = dotenv.parse(await readFile(file, 'utf8'));
  return Object.fromEntries(['OPENAI_API_KEY', 'DATABASE_URL', 'OPENAI_MODEL_CHAT', 'OPENAI_MODEL'].filter(key => parsed[key]).map(key => [key, parsed[key]]));
};

// The research owner is not a production User. Production policies are read as-is;
// audit metadata stays local, and this adapter cannot write to the application database.
export const createResearchGovernancePool = ({ pool, record }) => ({
  async query(sql, args) {
    if (/^INSERT INTO "AiGovernanceEvent" /.test(sql)) {
      await record({ entityType: args[1], entityId: args[2], action: args[4], reason: args[5], after: args[7] });
      return { rows: [] };
    }
    if (!/^SELECT\s/i.test(sql)) throw new Error('La conexión de investigación es de solo lectura.');
    return pool.query(sql, args);
  }
});
