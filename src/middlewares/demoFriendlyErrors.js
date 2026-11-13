import { demoFriendlyPayload, isDemoMode } from '../lib/demoMode.js';

// En la demo, un fallo del servidor (5xx) llega a la pantalla como «depende de una conexión real» y no como error
// (Rodny, 13 de noviembre de 2026). Fuera de la demo no se monta nada: producción responde exactamente igual que antes.
export const createDemoFriendlyErrors = ({ env = process.env } = {}) => (req, res, next) => {
    if (!isDemoMode(env)) return next();
    const json = res.json.bind(res);
    res.json = (body) => {
        const friendly = demoFriendlyPayload(res.statusCode, body, env);
        if (!friendly) return json(body);
        res.status(503);
        return json(friendly);
    };
    return next();
};

export const demoFriendlyErrors = createDemoFriendlyErrors();
