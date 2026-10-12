import pg from 'pg';
import { ensureAuditImmutability } from '../src/lib/auditImmutability.js';

// Inmutabilidad de los registros de auditoría (12 de octubre de 2026): triggers aditivos e idempotentes que
// rechazan editar o borrar cualquier fila de auditoría, salvo la purga automática por antigüedad dentro de una
// transacción marcada y el NULL de una llave foránea al borrar a una persona. No cambia ningún dato.
// Va al final de la cadena de `start`, después de que los demás ensure crearon sus tablas. AGENTS.md §21.
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  const result = await ensureAuditImmutability(client);
  console.log(`[Audit] Registros protegidos: ${result.protected.length}; triggers actualizados: ${result.changed.length}.`);
  if (result.missing.length) console.warn(`[Audit] Tablas que todavía no existen (se protegerán al crearse): ${result.missing.join(', ')}`);
} catch (error) {
  console.error('[Audit] No se pudieron proteger los registros de auditoría:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
