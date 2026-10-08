import 'dotenv/config';
import pg from 'pg';
import { getBriaChatStorage } from '../src/services/briaChatStorage.js';
import { migrateBriaChatAttachments } from '../src/services/briaChatAttachmentMigration.js';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5000 });
try {
  if (!process.argv.includes('--apply')) {
    const count = (await pool.query('SELECT count(*)::int AS n FROM bria_memory.conversation_attachments WHERE original_bytes IS NOT NULL')).rows[0].n;
    console.log(JSON.stringify({ dryRun: true, inlineAttachments: count }));
  } else console.log(JSON.stringify(await migrateBriaChatAttachments({ pool, storage: getBriaChatStorage() })));
} catch { console.error('No se pudo completar la migración verificada de adjuntos de Bria.'); process.exitCode = 1; }
finally { await pool.end(); }
