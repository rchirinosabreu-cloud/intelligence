import { normalizeClientErrorReport } from '../lib/appErrors.js';

// Registro de errores de pantalla (Rodny, 5 de octubre de 2026: «necesito que averigües si hay un
// bug»). Lo que vio la persona queda en una sola línea del registro del servidor, con quién, en
// qué pantalla, en qué versión y con la referencia que se le mostró, para encontrarlo después.
// Solo se escribe en el registro: nada se guarda en la base y la persona no espera respuesta.

const defaultLog = (line) => console.error(line);

export const reportClientErrorHandler = async (req, res, dependencies = {}) => {
    const log = dependencies.log || defaultLog;
    const { valid, report } = normalizeClientErrorReport(req.body);
    if (!valid) return res.status(400).json({ error: 'CLIENT_ERROR_INVALID', message: 'El registro del error no es válido.' });
    const userId = req.user?.userId || req.user?.id || null;
    const line = JSON.stringify({
        user: userId,
        email: req.user?.email || null,
        ...report
    });
    log(`[Client error] ${line}`);
    return res.status(204).end();
};
