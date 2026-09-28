import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import { computeDeadlines, dataRequestError, validateDataRequest } from '../lib/dataSubjectRequests.js';

// Registro de consultas y reclamos de titulares (Ley 1581), 27 de septiembre de 2026. Solo
// administradores activos; las fechas se guardan como texto 'YYYY-MM-DD' (día de Bogotá)
// para que ninguna zona horaria corra un plazo legal.

const COLUMNS = ['type', 'reason', 'channel', 'status', 'requesterName', 'requesterDocument', 'contactEmail', 'contactPhone', 'description',
    'receivedOn', 'extendedOn', 'extensionReason', 'incompleteRequestedOn', 'completedOn', 'legendAddedOn', 'respondedOn',
    'responseSummary', 'responseEvidence', 'notes'];
const PAGE_SIZE = 30;
const q = (column) => `"${column}"`;

export const formatDataRequestReference = (consecutive) => `SOL-${String(consecutive).padStart(4, '0')}`;

export const createDataRequestService = ({ pool, clock = () => new Date() }) => {
    const today = () => bogotaDate(clock());

    const assertAdmin = async (userId) => {
        const { rows } = await pool.query(`SELECT u.id FROM "User" u JOIN "TeamMember" t ON t."userId"=u.id WHERE u.id=$1 AND u.role='ADMIN' AND u."isActive"=true AND t."isActive"=true`, [userId]);
        if (!rows.length) throw dataRequestError('Solo administradores activos gestionan las solicitudes de titulares.', 403, 'DATA_REQUEST_FORBIDDEN');
    };

    const present = (row) => {
        const request = Object.fromEntries(COLUMNS.map((column) => [column, row[column] ?? null]));
        return { id: row.id, reference: formatDataRequestReference(row.consecutive), updatedAt: row.updatedAt, ...request, deadlines: computeDeadlines(request, today()) };
    };

    const list = async (userId, query = {}) => {
        await assertAdmin(userId);
        const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
        const onlyOpen = query.open === 'true';
        const { rows } = await pool.query(
            `SELECT * FROM "DataSubjectRequest" ${onlyOpen ? `WHERE status NOT IN ('RESPONDIDA','DESISTIDA')` : ''}
             ORDER BY (status IN ('RESPONDIDA','DESISTIDA')) ASC, "receivedOn" ASC, consecutive ASC LIMIT ${PAGE_SIZE + 1} OFFSET ${(page - 1) * PAGE_SIZE}`
        );
        return { items: rows.slice(0, PAGE_SIZE).map(present), hasMore: rows.length > PAGE_SIZE, page, today: today() };
    };

    const create = async (userId, input) => {
        await assertAdmin(userId);
        const request = validateDataRequest(input, { today: today() });
        const id = randomUUID();
        const values = COLUMNS.map((column) => request[column]);
        const { rows } = await pool.query(
            `INSERT INTO "DataSubjectRequest" (id, ${COLUMNS.map(q).join(', ')}, "createdById", "updatedById")
             VALUES ($1, ${COLUMNS.map((_, i) => `$${i + 2}`).join(', ')}, $${COLUMNS.length + 2}, $${COLUMNS.length + 2}) RETURNING *`,
            [id, ...values, userId]
        );
        return present(rows[0]);
    };

    const update = async (userId, id, input) => {
        await assertAdmin(userId);
        const request = validateDataRequest(input, { today: today() });
        const { rows } = await pool.query(
            `UPDATE "DataSubjectRequest" SET ${COLUMNS.map((column, i) => `${q(column)} = $${i + 2}`).join(', ')}, "updatedById" = $${COLUMNS.length + 2}, "updatedAt" = CURRENT_TIMESTAMP
             WHERE id = $1 RETURNING *`,
            [id, ...COLUMNS.map((column) => request[column]), userId]
        );
        if (!rows.length) throw dataRequestError('Solicitud no encontrada.', 404, 'DATA_REQUEST_NOT_FOUND');
        return present(rows[0]);
    };

    return { list, create, update };
};

let productionService;
export const getDataRequestService = () => productionService ||= createDataRequestService({
    pool: new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 })
});
