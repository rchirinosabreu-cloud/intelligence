/**
 * Las cifras que Meta entrega para un informe (Rodny, 2 de octubre de 2026): la cuenta de Instagram
 * del cliente, sus publicaciones y su cuenta publicitaria. Solo lee.
 *
 * Lo que aquí se pide está leído en la referencia de Meta y comprobado contra la cuenta de la agencia:
 * - Estadísticas de una cuenta de Instagram: `metric_type=total_value`, `period=day`, y **30 días como
 *   máximo** entre `since` y `until`. Un período más largo se pide por tramos (`insightWindows`): lo
 *   que se suma se suma, y el alcance —personas distintas— directamente no se pide.
 * - `impressions` ya no existe (Meta la retiró en abril de 2025); es `views`.
 * - Una publicación da su cifra acumulada, y la de una historia solo dura 24 horas.
 * - Pauta: `time_range` con los días exactos, en la zona horaria de la cuenta publicitaria.
 *
 * La llave va siempre en la cabecera `Authorization`, nunca en la dirección: las direcciones acaban
 * en registros y la llave no. La conversión a fuentes del informe es de `lib/metaReportSources.js`.
 */
import { META_GRAPH_ORIGIN, META_GRAPH_VERSION, MetaGraphError } from './metaGraphService.js';
import { insightWindows, pageInsightWindows, pageTotalRange, pageValueDay, previousPeriod } from '../lib/metaReportSources.js';

const DEFAULT_TIMEOUT_MS = 30 * 1000;
/** Con el alcance: solo cuando el período cabe en un tramo. */
const ADDITIVE_ACCOUNT_METRICS = ['views', 'total_interactions', 'likes', 'comments', 'shares', 'saves', 'profile_views', 'website_clicks'];
const UNIQUE_ACCOUNT_METRICS = ['reach', 'accounts_engaged'];
const COMPARISON_METRICS = ['views', 'total_interactions'];
const FORMAT_METRICS = ['views', 'total_interactions'];
const MEDIA_FIELDS = 'id,caption,media_type,media_product_type,timestamp,permalink';
const MEDIA_METRICS = 'reach,views,saved,shares,total_interactions';
/** Las publicaciones de un período que se leen una por una. Un cliente publica decenas, no cientos. */
export const META_MEDIA_MAX = 60;
/** Página de Facebook (referencia de Page Insights v26, 2 de octubre de 2026). Todas diarias y sumables, salvo `page_follows`. */
const PAGE_METRICS = ['page_media_view', 'page_post_engagements', 'page_video_views', 'page_views_total', 'page_total_actions', 'page_daily_follows_unique', 'page_daily_unfollows_unique'];
const PAGE_COMPARISON_METRICS = ['page_media_view', 'page_post_engagements'];
const PAGE_POST_FIELDS = 'id,message,created_time,permalink_url,status_type,shares,comments.summary(true).limit(0),reactions.summary(true).limit(0)';
const PAGE_POST_METRICS = 'post_media_view,post_total_media_view_unique,post_clicks';
const ADS_FIELDS ='spend,impressions,reach,clicks,inline_link_clicks,ctr,cpc,cpm';
const ADS_ROW_FIELDS = 'spend,impressions,reach,clicks';

export const createMetaInsightsService = ({
  fetchImpl = globalThis.fetch,
  version = META_GRAPH_VERSION,
  origin = META_GRAPH_ORIGIN,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = () => new Date()
} = {}) => {
  const get = async (path, params, token) => {
    const url = new URL(`${origin}/${version}/${path}`);
    for (const [key, value] of Object.entries(params || {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetchImpl(url.toString(), { method: 'GET', headers: { Authorization: `Bearer ${token}` }, ...(controller ? { signal: controller.signal } : {}) });
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

  const sumInto = (target, values) => {
    for (const [key, value] of Object.entries(values)) if (typeof value === 'number' && Number.isFinite(value)) target[key] = (target[key] || 0) + value;
    return target;
  };
  const totalsOf = (payload) => Object.fromEntries((payload?.data || []).filter((entry) => typeof entry?.total_value?.value === 'number').map((entry) => [entry.name, entry.total_value.value]));
  const breakdownOf = (payload) => Object.fromEntries((payload?.data?.[0]?.total_value?.breakdowns?.[0]?.results || []).map((row) => [String(row.dimension_values?.[0] ?? ''), row.value]));

  const accountTotals = async (igUserId, token, windows, metrics) => {
    const totals = {};
    for (const window of windows) {
      sumInto(totals, totalsOf(await get(`${igUserId}/insights`, { metric: metrics.join(','), period: 'day', metric_type: 'total_value', since: window.since, until: window.until }, token)));
    }
    return totals;
  };
  const accountBreakdown = async (igUserId, token, windows, metric, by) => {
    const parts = {};
    for (const window of windows) {
      sumInto(parts, breakdownOf(await get(`${igUserId}/insights`, { metric, period: 'day', metric_type: 'total_value', breakdown: by, since: window.since, until: window.until }, token)));
    }
    return parts;
  };
  /** Lo que es opcional no tumba el informe: si Meta no lo da, queda vacío. */
  const optional = async (work, fallback = null) => {
    try { return await work(); } catch { return fallback; }
  };

  /**
   * Todo lo de Instagram para un período: totales, comparación con los mismos días de antes,
   * seguidores, desglose por formato y cada publicación con sus cifras.
   */
  const fetchInstagramReport = async ({ igUserId, username = null, token, period }) => {
    const windows = insightWindows(period?.start, period?.end);
    if (!windows.length) throw Object.assign(new Error('El período del informe no es válido.'), { status: 422 });
    const reachIsExact = windows.length === 1;
    const metrics = reachIsExact ? [...ADDITIVE_ACCOUNT_METRICS, ...UNIQUE_ACCOUNT_METRICS] : ADDITIVE_ACCOUNT_METRICS;
    // Los totales son el informe: si Meta los niega (llave vencida, permiso), se dice y no sale nada a medias.
    const totals = await accountTotals(igUserId, token, windows, metrics);

    const comparison = previousPeriod(period);
    const comparisonWindows = comparison ? insightWindows(comparison.start, comparison.end) : [];
    const previousTotals = comparisonWindows.length
      ? await optional(() => accountTotals(igUserId, token, comparisonWindows, comparisonWindows.length === 1 && reachIsExact ? [...COMPARISON_METRICS, 'reach'] : COMPARISON_METRICS))
      : null;

    const follows = await optional(async () => {
      const parts = await accountBreakdown(igUserId, token, windows, 'follows_and_unfollows', 'follow_type');
      return Object.keys(parts).length ? parts : null;
    });
    const followerTotal = await optional(async () => (await get(String(igUserId), { fields: 'followers_count' }, token)).followers_count ?? null);

    const formats = {};
    for (const metric of reachIsExact ? [...FORMAT_METRICS, 'reach'] : FORMAT_METRICS) {
      const parts = await optional(() => accountBreakdown(igUserId, token, windows, metric, 'media_product_type'), {});
      if (Object.keys(parts).length) formats[metric] = parts;
    }

    const media = [];
    const listed = await optional(() => get(`${igUserId}/media`, { fields: MEDIA_FIELDS, since: windows[0].since, until: windows.at(-1).until, limit: META_MEDIA_MAX }, token), { data: [] });
    for (const item of (listed?.data || []).slice(0, META_MEDIA_MAX)) {
      const insights = await optional(async () => {
        const payload = await get(`${item.id}/insights`, { metric: MEDIA_METRICS }, token);
        const values = Object.fromEntries((payload?.data || []).filter((entry) => typeof entry?.values?.[0]?.value === 'number').map((entry) => [entry.name, entry.values[0].value]));
        return Object.keys(values).length ? values : null;
      });
      media.push({ ...item, insights });
    }

    return {
      account: { id: String(igUserId), username }, period, fetchedAt: now().toISOString(), reachIsExact, totals,
      previousTotals: previousTotals && Object.keys(previousTotals).length ? previousTotals : null, previousPeriod: comparison,
      follows, followerTotal, formats, media
    };
  };

  /**
   * La llave de una página, pedida a Meta en el momento. La que se guardó al conectar la página se
   * emitió con los permisos de ese día; las estadísticas de Facebook necesitan `read_insights`, que se
   * añadió después, y así no hay que reconectar a ningún cliente.
   */
  const getPageToken = async ({ pageId, token }) => {
    const payload = await get(String(pageId), { fields: 'access_token' }, token);
    if (!payload?.access_token) throw Object.assign(new Error('Meta no entregó la llave de esa página: la cuenta de la agencia ya no la administra.'), { status: 422 });
    return payload.access_token;
  };

  /** Los valores diarios de una página, sumados solo en los días del período. `page_follows` es un total corrido: se guarda el último. */
  const pageTotals = async (pageId, token, target, metrics) => {
    const totals = {};
    let followerTotal = null;
    let followerDay = null;
    for (const window of pageInsightWindows(target.start, target.end)) {
      const payload = await get(`${pageId}/insights`, { metric: metrics.join(','), period: 'day', since: window.since, until: window.until }, token);
      for (const entry of payload?.data || []) {
        for (const item of entry?.values || []) {
          const day = pageValueDay(item?.end_time);
          // Solo los días de este tramo: el margen que se pide de más cae dentro del tramo siguiente
          // y, contado aquí, ese día saldría dos veces.
          if (typeof item?.value !== 'number' || !day || day < window.first || day > window.last) continue;
          if (entry.name === 'page_follows') {
            if (!followerDay || day >= followerDay) { followerTotal = item.value; followerDay = day; }
          } else totals[entry.name] = (totals[entry.name] || 0) + item.value;
        }
      }
    }
    return { totals, followerTotal, followerDay };
  };

  /** Personas distintas que vieron la página en el período exacto: `total_over_range`, con `until` exclusivo. */
  const pageUniqueViewers = async (pageId, token, target) => {
    const range = pageTotalRange(target.start, target.end);
    if (!range) return null;
    const payload = await get(`${pageId}/insights`, { metric: 'page_total_media_view_unique', period: 'total_over_range', since: range.since, until: range.until }, token);
    const value = payload?.data?.[0]?.values?.[0]?.value;
    return typeof value === 'number' ? value : null;
  };

  /**
   * Una página de Facebook en un período: totales, comparación, seguidores al cierre y sus publicaciones.
   * Los nombres de las métricas son los de la referencia de Page Insights (v26); las «impresiones» de
   * página y `page_fans` ya no existen.
   */
  const fetchFacebookPageReport = async ({ pageId, pageName = null, token, period }) => {
    if (!pageInsightWindows(period?.start, period?.end).length) throw Object.assign(new Error('El período del informe no es válido.'), { status: 422 });
    const current = await pageTotals(pageId, token, period, [...PAGE_METRICS, 'page_follows']);
    if (!Object.keys(current.totals).length && current.followerTotal === null) {
      // Sin `read_insights` Meta no da error: responde una lista vacía. Lo mismo con una página pequeña.
      throw Object.assign(new Error('Meta no entregó estadísticas de esta página de Facebook. Suele ser porque a la llave de la agencia le falta el permiso de estadísticas de páginas (read_insights), o porque la página tiene menos de 100 «me gusta».'), { code: 'META_PAGE_INSIGHTS_EMPTY' });
    }
    const comparison = previousPeriod(period);
    const previous = comparison ? await optional(() => pageTotals(pageId, token, comparison, PAGE_COMPARISON_METRICS)) : null;
    const uniqueViewers = await optional(() => pageUniqueViewers(pageId, token, period));
    const previousUniqueViewers = comparison ? await optional(() => pageUniqueViewers(pageId, token, comparison)) : null;

    const posts = [];
    const windows = insightWindows(period.start, period.end);
    let params = { fields: PAGE_POST_FIELDS, since: windows[0].since, until: windows.at(-1).until, limit: 50 };
    for (let guard = 0; guard < 4 && posts.length < META_MEDIA_MAX; guard += 1) {
      const page = await optional(() => get(`${pageId}/published_posts`, params, token), null);
      for (const post of page?.data || []) if (posts.length < META_MEDIA_MAX) posts.push(post);
      const after = page?.paging?.cursors?.after;
      if (!page?.paging?.next || !after) break;
      params = { ...params, after };
    }
    for (const post of posts) {
      post.insights = await optional(async () => {
        const payload = await get(`${post.id}/insights`, { metric: PAGE_POST_METRICS }, token);
        // Meta devuelve algunas métricas dos veces, acumulada («lifetime») y por día con ceros; la
        // segunda pisaba a la primera y 917 visualizaciones salían con 0 espectadores (2 de octubre de 2026).
        const lifetime = (payload?.data || []).filter((entry) => !entry?.period || entry.period === 'lifetime');
        const values = Object.fromEntries(lifetime.filter((entry) => typeof entry?.values?.[0]?.value === 'number').map((entry) => [entry.name, entry.values[0].value]));
        return Object.keys(values).length ? values : null;
      });
    }

    return {
      account: { id: String(pageId), name: pageName }, period, fetchedAt: now().toISOString(), totals: current.totals,
      previousTotals: previous && Object.keys(previous.totals).length ? previous.totals : null, previousPeriod: comparison,
      followerTotal: current.followerTotal, followerDay: current.followerDay, uniqueViewers, previousUniqueViewers, posts
    };
  };

  const adAccountPath = (adAccountId) => `act_${String(adAccountId).replace(/^act_/, '')}`;

  const plain = (value) => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

  /**
   * La pauta de un período: totales, comparación, campañas y anuncios de una cuenta publicitaria.
   *
   * **Una cuenta publicitaria no es un cliente.** La agencia corre campañas de varios clientes desde
   * una misma cuenta (en la suya, en septiembre de 2026: Titanes, New Pueblito y Pablo Hoff), así que
   * los totales de la cuenta entera serían de todos a la vez. Con `campaignFilter` solo cuentan las
   * campañas cuyo nombre contiene ese texto, y el total **se le pide a Meta** con esas campañas
   * (`filtering` por identificador, operador `IN`): así el alcance sale bien, sin contar dos veces a
   * quien vio dos campañas. Sumar las filas de campaña daría un alcance inflado. Meta advierte que
   * filtrar por nombre (`CONTAIN`) no cambia el resumen; por eso se filtra por identificador.
   */
  const fetchAdsReport = async ({ adAccountId, token, period, campaignFilter = '' }) => {
    const path = adAccountPath(adAccountId);
    if (!period?.start || !period?.end) throw Object.assign(new Error('El período del informe no es válido.'), { status: 422 });
    const range = (target) => JSON.stringify({ since: target.start, until: target.end });
    const needle = plain(campaignFilter);
    const info = await get(path, { fields: 'name,account_id,currency' }, token);
    const campaignsOf = async (target) => {
      const rows = (await get(`${path}/insights`, { level: 'campaign', time_range: range(target), fields: `campaign_id,campaign_name,${ADS_ROW_FIELDS}`, limit: 500 }, token))?.data || [];
      return needle ? rows.filter((row) => plain(row.campaign_name).includes(needle)) : rows;
    };
    const filteringFor = (rows) => (needle ? JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: rows.map((row) => String(row.campaign_id)) }]) : undefined);
    const totalsOfRange = async (target, rows) => {
      if (needle && !rows.length) return null;
      return (await get(`${path}/insights`, { level: 'account', time_range: range(target), fields: ADS_FIELDS, filtering: filteringFor(rows) }, token))?.data?.[0] || null;
    };

    const campaigns = await campaignsOf(period);
    const totals = await totalsOfRange(period, campaigns);
    const comparison = previousPeriod(period);
    const previousTotals = comparison ? await optional(async () => totalsOfRange(comparison, needle ? await campaignsOf(comparison) : [])) : null;
    const ads = totals
      ? await optional(async () => (await get(`${path}/insights`, { level: 'ad', time_range: range(period), fields: `ad_id,ad_name,${ADS_ROW_FIELDS}`, filtering: filteringFor(campaigns), limit: 500 }, token))?.data || [], [])
      : [];
    return {
      account: { id: String(info.account_id || path.replace(/^act_/, '')), name: info.name || '', currency: info.currency || null },
      campaignFilter: needle ? String(campaignFilter).trim() : null,
      period, fetchedAt: now().toISOString(), totals, previousTotals, previousPeriod: comparison, campaigns, ads
    };
  };

  /** Las cuentas publicitarias que ve la llave, para elegir cuál es la del cliente. */
  const listAdAccounts = async (token) => {
    const accounts = [];
    let params = { fields: 'name,account_id,currency,account_status', limit: 200 };
    for (let guard = 0; guard < 10; guard += 1) {
      const page = await get('me/adaccounts', params, token);
      for (const entry of page?.data || []) {
        accounts.push({ id: String(entry.account_id), name: entry.name || String(entry.account_id), currency: entry.currency || null, isActive: Number(entry.account_status) === 1 });
      }
      const after = page?.paging?.cursors?.after;
      if (!page?.paging?.next || !after) break;
      params = { ...params, after };
    }
    return accounts;
  };

  return { fetchInstagramReport, fetchFacebookPageReport, getPageToken, fetchAdsReport, listAdAccounts };
};

export const metaInsightsService = createMetaInsightsService();
