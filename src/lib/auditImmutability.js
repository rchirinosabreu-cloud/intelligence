// Inmutabilidad de los registros de auditoría (12 de octubre de 2026). Ninguna fila de auditoría o de historial
// se edita ni se borra desde la aplicación, y la base de datos lo garantiza con un trigger `BEFORE UPDATE OR
// DELETE` y otro `BEFORE TRUNCATE` en cada tabla del catálogo. Hay tres salidas, y solo tres:
//  1. La purga automática por antigüedad: un DELETE dentro de una transacción que hizo `SET LOCAL
//     brainstudio.audit_purge = 'on'`, solo en las tablas que tienen retención y solo de filas vencidas
//     (con un día de margen por la zona horaria de las columnas sin zona). La marca no permite editar.
//  2. El NULL de una llave foránea: borrar un usuario pone en NULL al autor (`onDelete: SetNull`). Se acepta un
//     UPDATE que solo pone en NULL las columnas declaradas en `nullableRefs`; cualquier otro cambio se rechaza.
//     Se eligió así y no pasar esos borrados por la marca porque la persona se borra desde muchos sitios y la
//     fila conserva todo lo demás: qué pasó, cuándo y sobre qué.
//  3. Un UPDATE que no cambia nada (p. ej. un `upsert` con `update: {}`): no altera la evidencia.
// Contrato: tests/auditImmutability.test.js. Instalación: scripts/ensure-audit-immutability.js. AGENTS.md §22.

export const AUDIT_PURGE_SETTING = 'brainstudio.audit_purge';
export const AUDIT_PURGE_SQL = `SET LOCAL ${AUDIT_PURGE_SETTING} = 'on'`;

const VERSION = 'v1';
const ROW_TRIGGER = 'brainstudio_audit_immutable';
const TRUNCATE_TRIGGER = 'brainstudio_audit_no_truncate';
const GUARD_FUNCTION = 'brainstudio_audit_guard';

// Una sola lista. Quien cree otro registro de auditoría lo añade aquí en el mismo PR.
export const AUDIT_TABLES = Object.freeze([
    // Trazabilidad operativa (docs/OPERATIONAL_TRACE.md): retención de 365 días, como TRACE_RETENTION_DAYS.
    { schema: 'public', name: 'OperationalTraceEvent', retention: { column: 'occurredAt', days: 365 }, nullableRefs: ['actorId', 'subjectUserId'] },
    // Registro central de uso de IA: retención de 365 días, como USAGE_RETENTION_DAYS. Sin llaves.
    { schema: 'public', name: 'AiUsageEvent', retention: { column: 'occurredAt', days: 365 }, nullableRefs: [] },
    { schema: 'public', name: 'FinancialAuditEvent', retention: null, nullableRefs: ['actorId'] },
    // Historial de cambios del gobierno de IA; su autor es `onDelete: Restrict`.
    { schema: 'public', name: 'AiGovernanceEvent', retention: null, nullableRefs: [] },
    { schema: 'public', name: 'DeletedTaskLog', retention: null, nullableRefs: [] },
    { schema: 'vault', name: 'reveal_events', retention: null, nullableRefs: [] },
    { schema: 'vault', name: 'credential_events', retention: null, nullableRefs: [] },
    { schema: 'bria_memory', name: 'agency_fact_events', retention: null, nullableRefs: [] },
    { schema: 'bria_memory', name: 'learning_events', retention: null, nullableRefs: [] },
    { schema: 'bria_memory', name: 'decision_events', retention: null, nullableRefs: [] }
].map(Object.freeze));

const ident = (value) => `"${String(value).replace(/"/g, '""')}"`;
const literal = (value) => `'${String(value).replace(/'/g, "''")}'`;
const qualified = (spec) => `${ident(spec.schema)}.${ident(spec.name)}`;

const guardFunctionSql = (functionSchema) => `
CREATE OR REPLACE FUNCTION ${ident(functionSchema)}.${GUARD_FUNCTION}() RETURNS trigger LANGUAGE plpgsql AS $guard$
DECLARE
  old_row jsonb;
  new_row jsonb;
  expired boolean := false;
BEGIN
  -- TG_ARGV: [0] columna de retención ('' si no se purga), [1] días de retención, [2..] llaves que pueden quedar en NULL.
  IF TG_OP = 'DELETE' AND TG_ARGV[0] <> '' AND current_setting('${AUDIT_PURGE_SETTING}', true) = 'on' THEN
    EXECUTE format('SELECT ($1).%I < now() - make_interval(days => $2)', TG_ARGV[0]) INTO expired USING OLD, TG_ARGV[1]::int - 1;
    IF expired THEN RETURN OLD; END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    old_row := to_jsonb(OLD);
    new_row := to_jsonb(NEW);
    FOR i IN 2 .. TG_NARGS - 1 LOOP
      IF new_row -> TG_ARGV[i] = 'null'::jsonb THEN
        old_row := old_row - TG_ARGV[i];
        new_row := new_row - TG_ARGV[i];
      END IF;
    END LOOP;
    IF old_row = new_row THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION USING
    MESSAGE = format('El registro de auditoría %s.%s no se puede modificar ni borrar (%s).', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP),
    HINT = 'Solo la purga automática por antigüedad borra filas vencidas, dentro de una transacción con SET LOCAL ${AUDIT_PURGE_SETTING} = ''on''.';
END
$guard$`;

const triggerArgs = (spec) => [spec.retention?.column || '', String(spec.retention?.days || 0), ...spec.nullableRefs];
const signature = (spec, functionSchema) => `brainstudio-audit:${VERSION}:${functionSchema}:${triggerArgs(spec).join(',')}`;

const triggersSql = (spec, functionSchema) => {
    const table = qualified(spec);
    const fn = `${ident(functionSchema)}.${GUARD_FUNCTION}`;
    // Un solo texto sin parámetros: PostgreSQL lo ejecuta en una transacción implícita, así que la tabla
    // nunca queda un instante sin trigger.
    return [
        `DROP TRIGGER IF EXISTS ${ROW_TRIGGER} ON ${table}`,
        `CREATE TRIGGER ${ROW_TRIGGER} BEFORE UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION ${fn}(${triggerArgs(spec).map(literal).join(', ')})`,
        `COMMENT ON TRIGGER ${ROW_TRIGGER} ON ${table} IS ${literal(signature(spec, functionSchema))}`,
        `DROP TRIGGER IF EXISTS ${TRUNCATE_TRIGGER} ON ${table}`,
        `CREATE TRIGGER ${TRUNCATE_TRIGGER} BEFORE TRUNCATE ON ${table} FOR EACH STATEMENT EXECUTE FUNCTION ${fn}()`
    ].join(';\n');
};

// Idempotente y aditivo: no cambia ningún dato. Solo recrea los triggers cuya firma cambió, así que un
// arranque normal no pide ningún bloqueo sobre las tablas. Una tabla que todavía no existe se informa y se salta.
export const ensureAuditImmutability = async (db, { tables = AUDIT_TABLES, functionSchema = 'public' } = {}) => {
    await db.query(guardFunctionSql(functionSchema));
    const result = { protected: [], missing: [], changed: [] };
    for (const spec of tables) {
        const name = `${spec.schema}.${spec.name}`;
        const { rows: [table] } = await db.query('SELECT to_regclass($1) AS oid', [qualified(spec)]);
        if (!table?.oid) { result.missing.push(name); continue; }
        const { rows } = await db.query(
            `SELECT t.tgname, obj_description(t.oid, 'pg_trigger') AS signature FROM pg_trigger t
             WHERE t.tgrelid = $1::regclass AND t.tgname = ANY($2::text[]) AND NOT t.tgisinternal`,
            [qualified(spec), [ROW_TRIGGER, TRUNCATE_TRIGGER]]
        );
        const current = rows.find((row) => row.tgname === ROW_TRIGGER)?.signature;
        if (current !== signature(spec, functionSchema) || !rows.some((row) => row.tgname === TRUNCATE_TRIGGER)) {
            await db.query(triggersSql(spec, functionSchema));
            result.changed.push(name);
        }
        result.protected.push(name);
    }
    return result;
};

// Purga con `pg`: transacción propia en una sola conexión, marcada antes de borrar.
export const purgeAuditRows = async (pool, sql, params = []) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(AUDIT_PURGE_SQL);
        const result = await client.query(sql, params);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

// Purga con Prisma: transacción interactiva propia (nunca la de otro: la marca duraría hasta su final).
export const purgeAuditRowsWithPrisma = (db, run) => db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(AUDIT_PURGE_SQL);
    return run(tx);
});
