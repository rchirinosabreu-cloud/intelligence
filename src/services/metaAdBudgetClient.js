/**
 * Leer y cambiar el presupuesto de campañas en Meta (Pautas, 12 de noviembre de 2026). Es lo único de la plataforma que
 * cambia algo en una cuenta publicitaria, y solo el presupuesto: no crea, pausa ni borra campañas.
 *
 * Leído en la referencia de Meta (Marketing API): `GET /{campaign_id}` con `daily_budget`, `lifetime_budget`,
 * `budget_remaining`, `effective_status` y `stop_time`; si la campaña no tiene presupuesto lo llevan sus conjuntos,
 * `GET /{campaign_id}/adsets` con los mismos campos y `end_time`. Cambiar es `POST /{id}` con el campo y su valor en la
 * unidad mínima de la moneda. La llave va en la cabecera, nunca en la dirección.
 */
import { META_GRAPH_ORIGIN, META_GRAPH_VERSION, MetaGraphError } from './metaGraphService.js';

const TIMEOUT_MS = 30 * 1000;
const CAMPAIGN_FIELDS = 'name,effective_status,daily_budget,lifetime_budget,budget_remaining,stop_time';
const ADSET_FIELDS = 'name,effective_status,daily_budget,lifetime_budget,budget_remaining,end_time,campaign_id';

const hasBudget = (raw) => Number(raw?.daily_budget) > 0 || Number(raw?.lifetime_budget) > 0;

export const createMetaAdBudgetClient = ({ fetchImpl = globalThis.fetch, version = META_GRAPH_VERSION, origin = META_GRAPH_ORIGIN, timeoutMs = TIMEOUT_MS } = {}) => {
    const call = async (method, path, params, token) => {
        const url = new URL(`${origin}/${version}/${path}`);
        const body = new URLSearchParams();
        for (const [key, value] of Object.entries(params || {})) {
            if (value === undefined || value === null || value === '') continue;
            if (method === 'GET') url.searchParams.set(key, String(value));
            else body.set(key, String(value));
        }
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
        try {
            const response = await fetchImpl(url.toString(), {
                method,
                headers: { Authorization: `Bearer ${token}`, ...(method === 'GET' ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }) },
                ...(method === 'GET' ? {} : { body: body.toString() }),
                ...(controller ? { signal: controller.signal } : {})
            });
            let payload = null;
            try { payload = await response.json(); } catch { payload = null; }
            if (payload?.error || !response.ok) {
                const meta = payload?.error || {};
                throw new MetaGraphError(meta.message || `Meta respondió ${response.status}`, {
                    status: response.status || 0, code: meta.code ?? null, subcode: meta.error_subcode ?? null, type: meta.type ?? null,
                    fbtraceId: meta.fbtrace_id ?? null, userMessage: meta.error_user_msg ?? null
                });
            }
            return payload;
        } finally {
            if (timer) clearTimeout(timer);
        }
    };

    /**
     * El presupuesto de cada campaña: el suyo, o el de sus conjuntos si la campaña no tiene. Una campaña que falla no frena
     * a las demás: vuelve con su error.
     */
    const readCampaignBudgets = async ({ campaignIds, token }) => {
        const results = [];
        for (const id of campaignIds) {
            try {
                const campaign = await call('GET', encodeURIComponent(String(id)), { fields: CAMPAIGN_FIELDS }, token);
                if (hasBudget(campaign)) {
                    results.push({ campaignId: String(id), level: 'CAMPAIGN', raw: { id: String(id), ...campaign } });
                    continue;
                }
                const adsets = await call('GET', `${encodeURIComponent(String(id))}/adsets`, { fields: ADSET_FIELDS, limit: 100 }, token);
                for (const raw of adsets?.data || []) results.push({ campaignId: String(id), level: 'ADSET', raw });
                if (!(adsets?.data || []).length) results.push({ campaignId: String(id), level: 'CAMPAIGN', raw: { id: String(id), ...campaign } });
            } catch (error) {
                results.push({ campaignId: String(id), error });
            }
        }
        return results;
    };

    /** Cambia el presupuesto diario o total de una campaña o un conjunto. Meta responde `{ success: true }`. */
    const setBudget = async ({ objectId, field, minor, token }) => {
        if (!['daily_budget', 'lifetime_budget'].includes(field)) throw new Error('Solo se cambia el presupuesto.');
        return call('POST', encodeURIComponent(String(objectId)), { [field]: Math.round(minor) }, token);
    };

    return { readCampaignBudgets, setBudget };
};

export const metaAdBudgetClient = createMetaAdBudgetClient();
