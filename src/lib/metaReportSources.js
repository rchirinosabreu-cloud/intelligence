/**
 * Las cifras de Meta como fuentes del informe (Rodny, 2 de octubre de 2026).
 *
 * El módulo de Reportes leía sus cifras de capturas de pantalla con visión artificial y una persona
 * tenía que revisar cada número. «¿No podríamos hacer eso consultando directamente el Meta Business
 * del cliente y obteniendo de allí las cifras?» Sí para Instagram y para pauta, que la llave de la
 * agencia ya lee. Aquí las respuestas de Meta se convierten en **fuentes** con la misma forma que una
 * captura leída —observaciones con su período, su contexto y su origen—, así que siguen el camino de
 * siempre (conciliación, revisión, análisis, PDF). Subir capturas no cambia.
 *
 * Lógica pura: no llama a Meta ni toca la base. Lo que Meta no entrega no se inventa ni se estima.
 * Leído en la referencia de Meta y comprobado con la cuenta de la agencia el 2 de octubre de 2026.
 */

export const META_API_ORIGIN = 'META_API';
/** «There cannot be more than 30 days (2592000 s) between since and until»: así responde Meta. */
export const META_INSIGHTS_MAX_WINDOW_SECONDS = 30 * 24 * 60 * 60;
const DAY_SECONDS = 24 * 60 * 60;
/** Bogotá no tiene horario de verano: siempre -05:00. */
const bogotaEpoch = (day, endOfDay = false) => Math.floor(new Date(`${day}T${endOfDay ? '23:59:59' : '00:00:00'}-05:00`).getTime() / 1000);
const isDay = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

/**
 * El período cortado en tramos seguidos de 30 días como máximo, que es lo que Meta deja pedir de una
 * vez en las estadísticas de una cuenta de Instagram. Las cifras que se suman (visualizaciones,
 * interacciones) se piden por tramo y se suman; las que cuentan personas distintas (alcance) no se
 * pueden sumar, así que solo existen cuando el período cabe en un tramo.
 */
export const insightWindows = (start, end) => {
  if (!isDay(start) || !isDay(end) || start > end) return [];
  const last = bogotaEpoch(end, true);
  const windows = [];
  for (let since = bogotaEpoch(start); since <= last;) {
    const until = Math.min(since + META_INSIGHTS_MAX_WINDOW_SECONDS - 1, last);
    windows.push({ since, until });
    since = until + 1;
  }
  return windows;
};

const shiftDay = (day, days) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_SECONDS * 1000).toISOString().slice(0, 10);

/**
 * Las estadísticas de una página de Facebook: «Only 90 days of insights can be viewed at one time when
 * using the since and until parameters». Se piden tramos de 88 días de datos con dos días de margen al
 * final (89 de punta a punta), y de lo que llega solo se cuentan los días del período (`pageValueDay`):
 * así no importa si Meta incluye o no el último día pedido.
 */
export const META_PAGE_WINDOW_DAYS = 88;
export const pageInsightWindows = (start, end) => {
  if (!isDay(start) || !isDay(end) || start > end) return [];
  const windows = [];
  for (let first = start; first <= end;) {
    const candidate = shiftDay(first, META_PAGE_WINDOW_DAYS - 1);
    const last = candidate < end ? candidate : end;
    windows.push({ since: first, until: shiftDay(last, 2), first, last });
    first = shiftDay(last, 1);
  }
  return windows;
};

/**
 * A qué día pertenece un valor diario de una página. Meta marca cada valor con el **final** de su día
 * (`end_time`, medianoche del Pacífico: «2026-09-02T07:00:00+0000» es el 1 de septiembre).
 */
export const pageValueDay = (endTime) => {
  const time = Date.parse(endTime);
  return Number.isNaN(time) ? null : new Date(time - DAY_SECONDS * 1000).toISOString().slice(0, 10);
};

/** El período de comparación: los mismos días, justo antes, como compara Meta Business Suite. */
export const previousPeriod = ({ start, end } = {}) => {
  if (!isDay(start) || !isDay(end) || start > end) return null;
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / (DAY_SECONDS * 1000)) + 1;
  const previousEnd = shiftDay(start, -1);
  return { start: shiftDay(previousEnd, -(days - 1)), end: previousEnd };
};

const number = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const round = (value, decimals) => (value === null ? null : Math.round(value * 10 ** decimals) / 10 ** decimals);

/** La variación frente al período anterior, con un decimal. De un cero no sale un porcentaje. */
export const changePct = (current, previous) => {
  const now = number(current);
  const before = number(previous);
  if (now === null || before === null || before <= 0) return null;
  return round(((now - before) / before) * 100, 1);
};

const plainText = (value) => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/** Una campaña «es del cliente» si su nombre contiene la palabra elegida, sin distinguir mayúsculas ni tildes. */
export const campaignMatches = (name, filter) => {
  const needle = plainText(filter);
  return !needle || plainText(name).includes(needle);
};

/**
 * Qué campañas entrarían al informe con esa palabra y cuáles quedarían fuera (Rodny, 2 de octubre de
 * 2026: muchos clientes no tienen cuenta propia y se usa la de Francisco Villa, así que la palabra es lo
 * único que separa a un cliente de otro; mejor verla antes de vincular que adivinar).
 */
export const splitCampaigns = (campaigns, filter = '') => {
  const rows = (Array.isArray(campaigns) ? campaigns : []).filter((row) => row && row.name);
  const matching = rows.filter((row) => campaignMatches(row.name, filter));
  return { matching, others: rows.filter((row) => !matching.includes(row)) };
};

/** Las cuentas publicitarias que ve la llave son más de una docena: se buscan por nombre o número, activas primero. */
export const filterAdAccounts = (accounts, search = '') => {
  const needle = plainText(search);
  return (Array.isArray(accounts) ? accounts : [])
    .filter((account) => !needle || plainText(account.name).includes(needle) || String(account.id || '').includes(needle))
    .sort((a, b) => Number(b.isActive !== false) - Number(a.isActive !== false) || String(a.name || '').localeCompare(String(b.name || ''), 'es'));
};

/**
 * Qué hace el botón del informe según lo elegido: leer capturas, traer cifras de Meta o las dos cosas.
 * Sin capturas ni cuenta de Meta no hay nada que leer y el botón se apaga.
 */
export const reportSourcePlan = ({ screenshots = 0, instagramAccountId = null, facebookAccountId = null, adAccountId = null } = {}) => {
  const meta = Boolean(instagramAccountId || facebookAccountId || adAccountId);
  const files = Number(screenshots) > 0;
  if (meta && files) return { ready: true, label: 'Leer capturas y traer cifras', busyLabel: 'Leyendo capturas y consultando Meta…' };
  if (meta) return { ready: true, label: 'Traer cifras de Meta', busyLabel: 'Consultando Meta…' };
  return { ready: files, label: 'Leer capturas', busyLabel: 'Leyendo capturas…' };
};

/** Una fuente traída de Meta no tiene captura que mostrar: su comprobante es la respuesta de Meta. */
export const isMetaSource = (source) => (source?.origin || source?.extractionData?.origin) === META_API_ORIGIN;

/** «3 fuentes de Meta · 2 capturas»: de qué está hecho el informe, sin llamar captura a lo que no lo es. */
export const describeReportSources = (metrics) => {
  const summary = metrics?.processingSummary || {};
  const extractions = Array.isArray(metrics?.sourceExtractions) ? metrics.sourceExtractions : [];
  const meta = Number(summary.metaSources ?? extractions.filter(isMetaSource).length) || 0;
  const files = Number(summary.totalFiles ?? extractions.filter((source) => !isMetaSource(source)).length) || 0;
  const parts = [];
  if (meta) parts.push(`${meta} ${meta === 1 ? 'fuente' : 'fuentes'} de Meta`);
  if (files || !meta) parts.push(`${files} ${files === 1 ? 'captura' : 'capturas'}`);
  return parts.join(' · ');
};

const META_READ_ERRORS = {
  190: 'La conexión con Meta venció: hay que volver a conectar la cuenta desde la ficha del cliente.',
  102: 'La conexión con Meta venció: hay que volver a conectar la cuenta desde la ficha del cliente.',
  10: 'La llave de Meta de la agencia no tiene permiso para leer las estadísticas de esta cuenta.',
  200: 'La llave de Meta de la agencia no tiene permiso para leer las estadísticas de esta cuenta.',
  4: 'Meta puso un límite temporal de consultas. Inténtalo de nuevo en unos minutos.',
  17: 'Meta puso un límite temporal de consultas. Inténtalo de nuevo en unos minutos.',
  32: 'Meta puso un límite temporal de consultas. Inténtalo de nuevo en unos minutos.',
  613: 'Meta puso un límite temporal de consultas. Inténtalo de nuevo en unos minutos.',
  80000: 'Meta puso un límite temporal de consultas de pauta. Inténtalo de nuevo en unos minutos.',
  80004: 'Meta puso un límite temporal de consultas de pauta. Inténtalo de nuevo en unos minutos.'
};
const NETWORK_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT', 'ABORT_ERR']);

/** Por qué Meta no entregó las cifras, dicho para quien arma el informe. Nunca un código a secas. */
export const humanizeMetaReadError = (error) => {
  if (!error) return 'Meta no respondió.';
  const code = Number(error.code);
  if (Number.isFinite(code) && META_READ_ERRORS[code]) return META_READ_ERRORS[code];
  if (NETWORK_CODES.has(String(error.code)) || error.name === 'AbortError') return 'No se pudo llegar a Meta. Inténtalo de nuevo en un momento.';
  const message = String(error.userMessage || error.message || '').trim();
  const fromMeta = error.name === 'MetaGraphError' || (error.code != null && Number.isFinite(code));
  if (!fromMeta) return message ? `No se pudieron traer las cifras: ${message}` : 'No se pudieron traer las cifras.';
  return message ? `Meta respondió: ${message}` : 'Meta respondió con un error sin detalle.';
};

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const bogotaParts = (value) => {
  const shifted = new Date(new Date(value).getTime() - 5 * 60 * 60 * 1000);
  return { day: shifted.getUTCDate(), month: shifted.getUTCMonth(), year: shifted.getUTCFullYear() };
};
const shortDay = (value) => { const { day, month } = bogotaParts(value); return `${day} ${MONTHS[month]}`; };
const LONG_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const longDay = (value) => { const { day, month, year } = bogotaParts(value); return `${day} de ${LONG_MONTHS[month]} de ${year}`; };

/** Las cifras de la cuenta: cómo se llama cada una en Meta y cómo en el informe. */
const INSTAGRAM_ACCOUNT_METRICS = [
  ['views', 'views', 'Visualizaciones'],
  ['reach', 'reach', 'Alcance'],
  ['total_interactions', 'interactions', 'Interacciones con el contenido'],
  ['accounts_engaged', 'accountsEngaged', 'Cuentas que interactuaron'],
  ['likes', 'likes', 'Me gusta'],
  ['comments', 'comments', 'Comentarios'],
  ['shares', 'shares', 'Compartidos'],
  ['saves', 'saves', 'Guardados'],
  ['profile_views', 'profileVisits', 'Visitas al perfil'],
  ['website_clicks', 'websiteClicks', 'Clics al sitio web']
];
/** Las superficies de Instagram según Meta (`media_product_type`), con el nombre que usa el equipo. */
const FORMAT_LABELS = { REEL: 'Reels', REELS: 'Reels', POST: 'Publicaciones', CAROUSEL_CONTAINER: 'Carruseles', STORY: 'Historias' };
/** Los anuncios tienen su propia sección (pauta) e IGTV ya no existe: con la cuenta de la agencia salían filas de «1». */
const SKIPPED_SURFACES = new Set(['AD', 'IGTV']);
const FORMAT_METRICS = [['views', 'views', 'Visualizaciones'], ['reach', 'reach', 'Alcance'], ['total_interactions', 'interactions', 'Interacciones con el contenido']];
const MEDIA_METRICS = [['views', 'views', 'Visualizaciones'], ['reach', 'reach', 'Alcance'], ['total_interactions', 'interactions', 'Interacciones con el contenido'], ['saved', 'saves', 'Guardados'], ['shares', 'shares', 'Compartidos']];

const mediaKind = (media) => {
  if (media.media_product_type === 'REELS') return { one: 'Reel', many: 'Reels' };
  if (media.media_product_type === 'STORY') return { one: 'Historia', many: 'Historias' };
  if (media.media_type === 'CAROUSEL_ALBUM') return { one: 'Carrusel', many: 'Carruseles' };
  return { one: media.media_type === 'VIDEO' ? 'Video' : 'Publicación', many: 'Publicaciones' };
};
const firstLine = (caption, max = 60) => {
  const line = String(caption || '').split('\n').map((part) => part.trim()).find(Boolean) || '';
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
};

/**
 * Instagram como fuentes del informe: la cuenta (resumen, seguidores, formatos) y sus publicaciones.
 *
 * `reachIsExact` lo dice quien consultó: si el período necesitó más de un tramo, el alcance y las
 * cuentas que interactuaron no existen —sumar tramos contaría dos veces a la misma persona— y se
 * avisa en vez de poner un número.
 */
export const buildInstagramSources = ({
  account, period, fetchedAt = new Date().toISOString(), reachIsExact = true, totals = {}, previousTotals = null,
  previousPeriod: comparison = null, follows = null, followerTotal = null, formats = {}, media = [], sourceIds = {}
} = {}) => {
  const handle = account?.username ? `@${account.username}` : 'Instagram';
  const asked = longDay(fetchedAt);
  const base = { platform: 'INSTAGRAM', unit: 'count', precision: 'EXACT', confidence: 1, period, periodProvenance: 'SOURCE_VISIBLE' };
  const accountEvidence = `Meta · estadísticas de la cuenta de Instagram ${handle} · consultado el ${asked}`;
  const warnings = [];
  const observations = [];

  for (const [metaKey, key, label] of INSTAGRAM_ACCOUNT_METRICS) {
    const value = number(totals?.[metaKey]);
    if (value === null) continue;
    const change = previousTotals ? changePct(value, previousTotals[metaKey]) : null;
    observations.push({
      ...base, id: `account-${key}`, key, label, value, scope: 'TOTAL', entityLevel: 'ACCOUNT', contextKey: 'account_content', evidence: accountEvidence,
      ...(change !== null && comparison ? { changePct: change, comparisonPeriod: comparison } : {})
    });
  }
  if (!reachIsExact) {
    warnings.push('Meta entrega el alcance de 30 días como máximo. Este período es más largo, así que el alcance y las cuentas que interactuaron no se incluyen: sumarlos por tramos contaría dos veces a la misma persona.');
  }
  const gained = number(follows?.FOLLOWER);
  if (gained !== null) observations.push({ ...base, id: 'account-follows', key: 'follows', label: 'Nuevos seguidores', value: gained, scope: 'TOTAL', entityLevel: 'ACCOUNT', contextKey: 'account_audience', evidence: accountEvidence });
  const lost = number(follows?.NON_FOLLOWER);
  if (lost !== null) observations.push({ ...base, id: 'account-unfollows', key: 'unfollows', label: 'Dejaron de seguir', value: lost, scope: 'TOTAL', entityLevel: 'ACCOUNT', contextKey: 'account_audience', evidence: accountEvidence });
  const followers = number(followerTotal);
  if (followers !== null) {
    observations.push({
      ...base, id: 'account-followerTotal', key: 'followerTotal', label: 'Seguidores', value: followers, scope: 'TOTAL', entityLevel: 'ACCOUNT', contextKey: 'account_audience',
      evidence: `Meta · seguidores de ${handle} al momento de la consulta (${asked}), no al cierre del período`
    });
  }

  const published = (Array.isArray(media) ? media : []).filter((item) => item && item.id);
  observations.push({ ...base, id: 'account-contentCount', key: 'contentCount', label: 'Contenido publicado', value: published.length, scope: 'ORGANIC', entityLevel: 'ACCOUNT', contextKey: 'account_content', evidence: `Meta · publicaciones de ${handle} en el período · consultado el ${asked}` });

  // Por formato: lo que Meta desglosa por superficie, y cuántas piezas de cada tipo se publicaron.
  const formatNames = new Set();
  for (const [metaKey, key, label] of FORMAT_METRICS) {
    for (const [surface, raw] of Object.entries(formats?.[metaKey] || {})) {
      const value = number(raw);
      const name = FORMAT_LABELS[surface] || surface;
      if (value === null || SKIPPED_SURFACES.has(surface)) continue;
      formatNames.add(name);
      observations.push({ ...base, id: `format-${surface}-${key}`, key, label, value, scope: 'TOTAL', entityLevel: 'FORMAT', entityName: name, contextKey: 'account_content', evidence: `Meta · ${label.toLowerCase()} de ${handle} por formato (${name}) · consultado el ${asked}` });
    }
  }
  const countByKind = new Map();
  for (const item of published) countByKind.set(mediaKind(item).many, (countByKind.get(mediaKind(item).many) || 0) + 1);
  for (const [name, count] of countByKind) {
    observations.push({ ...base, id: `format-${name}-contentCount`, key: 'contentCount', label: 'Contenido publicado', value: count, scope: 'ORGANIC', entityLevel: 'FORMAT', entityName: name, contextKey: 'account_content', evidence: `Meta · publicaciones de ${handle} en el período por tipo (${name}) · consultado el ${asked}` });
  }

  const accountSource = {
    sourceId: sourceIds.account || `meta-instagram-${account?.id || 'cuenta'}-account`, origin: META_API_ORIGIN, platform: 'INSTAGRAM', screenType: 'META_API_INSTAGRAM_ACCOUNT',
    originalName: `Instagram ${handle} · cifras de Meta`, declaredCategory: 'SOCIAL', period, contextKey: 'account_content', confidence: 1, fetchedAt, warnings, observations, panels: []
  };

  // Publicaciones: Meta da la cifra acumulada desde que salió la pieza, no la del período. Se dice.
  const contentObservations = [];
  for (const item of published) {
    if (!item.insights) continue;
    const kind = mediaKind(item).one;
    const caption = firstLine(item.caption);
    const name = [shortDay(item.timestamp), kind, caption].filter(Boolean).join(' · ');
    for (const [metaKey, key, label] of MEDIA_METRICS) {
      const value = number(item.insights[metaKey]);
      if (value === null) continue;
      contentObservations.push({
        ...base, id: `media-${item.id}-${key}`, key, label, value, scope: 'ORGANIC', entityLevel: 'CONTENT', entityId: String(item.id), entityName: name,
        contextKey: 'published_content', contextLabel: 'Publicaciones del período, acumulado a la fecha de consulta', contextProvenance: 'SOURCE_VISIBLE',
        evidence: `Meta · estadísticas de la publicación del ${shortDay(item.timestamp)} en ${handle} · acumulado desde que salió hasta el ${asked}${item.permalink ? ` · ${item.permalink}` : ''}`
      });
    }
  }
  if (!contentObservations.length) return [accountSource];
  return [accountSource, {
    sourceId: sourceIds.content || `meta-instagram-${account?.id || 'cuenta'}-content`, origin: META_API_ORIGIN, platform: 'INSTAGRAM', screenType: 'META_API_INSTAGRAM_CONTENT',
    originalName: `Publicaciones de ${handle} · cifras de Meta`, declaredCategory: 'SOCIAL', period, contextKey: 'published_content', confidence: 1, fetchedAt, warnings: [], observations: contentObservations, panels: []
  }];
};

/**
 * Las cifras de una página de Facebook: cómo se llaman en Meta (referencia de Page Insights v26, leída
 * el 2 de octubre de 2026) y cómo en el informe. Las «impresiones» de página ya no existen: Meta las
 * retiró y dejó las visualizaciones (`page_media_view`).
 */
const FACEBOOK_PAGE_METRICS = [
  ['page_media_view', 'views', 'Visualizaciones', 'account_content', ''],
  ['page_post_engagements', 'interactions', 'Interacciones con el contenido', 'account_content', ' · Meta no cuenta aquí las interacciones en reels'],
  ['page_video_views', 'videoViews', 'Reproducciones de video', 'account_content', ' · reproducciones de al menos 3 segundos'],
  ['page_views_total', 'profileVisits', 'Visitas al perfil', 'account_content', ''],
  ['page_total_actions', 'pageActions', 'Clics en el contacto y el botón de la página', 'account_content', ''],
  ['page_daily_follows_unique', 'follows', 'Nuevos seguidores', 'account_audience', ' · estimación de Meta'],
  ['page_daily_unfollows_unique', 'unfollows', 'Dejaron de seguir', 'account_audience', ' · estimación de Meta']
];
const FACEBOOK_POST_KINDS = { added_video: 'Video', added_photos: 'Foto', shared_story: 'Enlace', mobile_status_update: 'Publicación', created_event: 'Evento' };
export const FACEBOOK_VIEWERS_NOTE = 'Facebook: Meta no entregó los espectadores de la página (personas distintas) para este período, así que el informe sale sin ellos. Sumar los de cada día contaría dos veces a la misma persona.';

/**
 * Los espectadores de la página para el período exacto se piden con `period=total_over_range`, y ahí
 * `until` es **exclusivo** (comprobado el 2 de octubre de 2026: 1→2 de septiembre devolvió el día 1).
 */
export const pageTotalRange = (start, end) => (isDay(start) && isDay(end) && start <= end ? { since: start, until: shiftDay(end, 1) } : null);

/**
 * Una página de Facebook como fuentes del informe: la página (resumen y seguidores) y sus publicaciones.
 *
 * Los seguidores son los del **último día del período** que Meta tiene (`followerDay`), no los de hoy.
 * Las reacciones, comentarios y compartidos de una publicación vienen de la publicación misma; sus
 * visualizaciones y espectadores, de sus estadísticas, y si Meta no las da la fila sale sin ellas.
 */
export const buildFacebookSources = ({
  account, period, fetchedAt = new Date().toISOString(), totals = {}, previousTotals = null, previousPeriod: comparison = null,
  followerTotal = null, followerDay = null, uniqueViewers = null, previousUniqueViewers = null, posts = [], sourceIds = {}
} = {}) => {
  const name = account?.name || 'Facebook';
  const asked = longDay(fetchedAt);
  const base = { platform: 'FACEBOOK', unit: 'count', precision: 'EXACT', confidence: 1, period, periodProvenance: 'SOURCE_VISIBLE' };
  const observations = [];
  const warnings = [];

  // Espectadores: personas distintas en el período exacto, que Meta sí da para una página (a
  // diferencia de Instagram, donde el alcance se corta a 30 días).
  const viewers = number(uniqueViewers);
  if (viewers !== null) {
    const change = changePct(viewers, previousUniqueViewers);
    observations.push({
      ...base, id: 'page-viewers', key: 'viewers', label: 'Espectadores', value: viewers, scope: 'TOTAL', entityLevel: 'ACCOUNT', contextKey: 'account_content',
      evidence: `Meta · personas distintas que vieron contenido de la página «${name}» en el período · consultado el ${asked}`,
      ...(change !== null && comparison ? { changePct: change, comparisonPeriod: comparison } : {})
    });
  } else warnings.push(FACEBOOK_VIEWERS_NOTE);

  for (const [metaKey, key, label, contextKey, note] of FACEBOOK_PAGE_METRICS) {
    const value = number(totals?.[metaKey]);
    if (value === null) continue;
    const change = previousTotals && ['views', 'interactions'].includes(key) ? changePct(value, previousTotals[metaKey]) : null;
    observations.push({
      ...base, id: `page-${key}`, key, label, value, scope: 'TOTAL', entityLevel: 'ACCOUNT', contextKey,
      evidence: `Meta · estadísticas de la página de Facebook «${name}»${note} · consultado el ${asked}`,
      ...(change !== null && comparison ? { changePct: change, comparisonPeriod: comparison } : {})
    });
  }
  const followers = number(followerTotal);
  if (followers !== null) {
    observations.push({
      ...base, id: 'page-followerTotal', key: 'followerTotal', label: 'Seguidores', value: followers, scope: 'TOTAL', entityLevel: 'ACCOUNT', contextKey: 'account_audience',
      evidence: `Meta · seguidores de la página «${name}»${isDay(followerDay) ? ` al cierre del ${longDay(`${followerDay}T12:00:00Z`)}` : ''} · consultado el ${asked}`
    });
  }
  const published = (Array.isArray(posts) ? posts : []).filter((post) => post && post.id);
  observations.push({ ...base, id: 'page-contentCount', key: 'contentCount', label: 'Contenido publicado', value: published.length, scope: 'ORGANIC', entityLevel: 'ACCOUNT', contextKey: 'account_content', evidence: `Meta · publicaciones de la página «${name}» en el período · consultado el ${asked}` });

  const accountSource = {
    sourceId: sourceIds.account || `meta-facebook-${account?.id || 'pagina'}-account`, origin: META_API_ORIGIN, platform: 'FACEBOOK', screenType: 'META_API_FACEBOOK_PAGE',
    originalName: `Facebook «${name}» · cifras de Meta`, declaredCategory: 'SOCIAL', period, contextKey: 'account_content', confidence: 1, fetchedAt,
    warnings, observations, panels: []
  };

  const contentObservations = [];
  for (const post of published) {
    const label = [shortDay(post.created_time), FACEBOOK_POST_KINDS[post.status_type] || 'Publicación', firstLine(post.message)].filter(Boolean).join(' · ');
    const evidence = `Meta · publicación del ${shortDay(post.created_time)} en la página «${name}» · acumulado desde que salió hasta el ${asked}${post.permalink_url ? ` · ${post.permalink_url}` : ''}`;
    const figures = [
      ['views', 'Visualizaciones', post.insights?.post_media_view],
      ['viewers', 'Espectadores', post.insights?.post_total_media_view_unique],
      ['reactions', 'Reacciones', post.reactions?.summary?.total_count],
      ['comments', 'Comentarios', post.comments?.summary?.total_count],
      // Meta omite `shares` cuando nadie compartió: visto en las publicaciones de la agencia.
      ['shares', 'Compartidos', post.shares?.count ?? 0],
      ['clicks', 'Clics', post.insights?.post_clicks]
    ];
    for (const [key, metricLabel, raw] of figures) {
      const value = number(raw);
      if (value === null) continue;
      contentObservations.push({
        ...base, id: `post-${post.id}-${key}`, key, label: metricLabel, value, scope: 'ORGANIC', entityLevel: 'CONTENT', entityId: String(post.id), entityName: label,
        contextKey: 'published_content', contextLabel: 'Publicaciones del período, acumulado a la fecha de consulta', contextProvenance: 'SOURCE_VISIBLE', evidence
      });
    }
  }
  if (!contentObservations.length) return [accountSource];
  return [accountSource, {
    sourceId: sourceIds.content || `meta-facebook-${account?.id || 'pagina'}-content`, origin: META_API_ORIGIN, platform: 'FACEBOOK', screenType: 'META_API_FACEBOOK_CONTENT',
    originalName: `Publicaciones de «${name}» en Facebook · cifras de Meta`, declaredCategory: 'SOCIAL', period, contextKey: 'published_content', confidence: 1, fetchedAt, warnings: [], observations: contentObservations, panels: []
  }];
};

const ADS_ACCOUNT_METRICS = [
  ['spend', 'spend', 'Importe gastado', 'money'], ['impressions', 'impressions', 'Impresiones', 'count'], ['reach', 'reach', 'Alcance', 'count'],
  ['clicks', 'clicks', 'Clics', 'count'], ['inline_link_clicks', 'linkClicks', 'Clics en el enlace', 'count'],
  ['ctr', 'ctr', 'CTR', 'percent'], ['cpc', 'cpc', 'CPC', 'money'], ['cpm', 'cpm', 'CPM', 'money']
];
const ADS_ROW_METRICS = ADS_ACCOUNT_METRICS.filter(([metaKey]) => ['spend', 'impressions', 'reach', 'clicks'].includes(metaKey));
/** Los anuncios del informe: los que más invirtieron. Una cuenta grande tiene cientos. */
export const META_ADS_MAX_ROWS = 25;

/**
 * La pauta como fuente del informe: los totales de la cuenta publicitaria, sus campañas y sus anuncios.
 * La moneda es la de la cuenta —la dice Meta—, no la del informe: una cuenta en dólares dentro de un
 * informe en pesos conserva sus dólares, sin convertir. Sin inversión ni impresiones no hay fuente.
 */
export const buildMetaAdsSource = ({
  account, period, fetchedAt = new Date().toISOString(), totals = null, previousTotals = null, previousPeriod: comparison = null,
  campaigns = [], ads = [], campaignFilter = null, sourceId = null
} = {}) => {
  if (!totals || (!(number(totals.spend) > 0) && !(number(totals.impressions) > 0))) return null;
  const currency = /^[A-Z]{3}$/.test(String(account?.currency || '')) ? account.currency : 'UNKNOWN';
  const asked = longDay(fetchedAt);
  const name = account?.name || 'cuenta publicitaria';
  // Una cuenta publicitaria puede llevar campañas de varios clientes: si el informe solo cuenta las
  // de uno, cada cifra lo dice. Sin eso, un total parcial pasaría por el de la cuenta entera.
  const only = campaignFilter ? ` · solo las campañas cuyo nombre contiene «${campaignFilter}»` : '';
  const base = { platform: 'META_ADS', scope: 'PAID', precision: 'EXACT', confidence: 1, period, periodProvenance: 'SOURCE_VISIBLE', contextKey: 'advertising' };
  const evidence = (what) => `Meta · ${what} de la cuenta publicitaria «${name}»${only} · consultado el ${asked}`;
  const valueOf = (raw, kind) => (kind === 'count' ? number(raw) : round(number(raw), 2));
  const unitOf = (kind) => (kind === 'money' ? currency : kind === 'percent' ? '%' : 'count');
  const observations = [];
  const warnings = [];

  for (const [metaKey, key, label, kind] of ADS_ACCOUNT_METRICS) {
    const value = valueOf(totals[metaKey], kind);
    if (value === null) continue;
    // La variación solo de lo que se suma: un CTR o un costo por clic no «crecen» como un total.
    const change = previousTotals && ['spend', 'impressions', 'clicks', 'inline_link_clicks'].includes(metaKey) ? changePct(value, previousTotals[metaKey]) : null;
    observations.push({
      ...base, id: `account-${key}`, key, label, value, unit: unitOf(kind), entityLevel: 'ACCOUNT', evidence: evidence('resultados'),
      ...(change !== null && comparison ? { changePct: change, comparisonPeriod: comparison } : {})
    });
  }

  const rows = (list, level, idField, nameField) => {
    const active = (Array.isArray(list) ? list : []).filter((row) => row && row[idField] && (number(row.spend) > 0 || number(row.impressions) > 0))
      .sort((a, b) => (number(b.spend) || 0) - (number(a.spend) || 0));
    if (active.length > META_ADS_MAX_ROWS) warnings.push(`La cuenta tuvo ${active.length} ${level === 'AD' ? 'anuncios' : 'campañas'} con actividad; el informe incluye ${level === 'AD' ? 'los' : 'las'} ${META_ADS_MAX_ROWS} de mayor inversión.`);
    for (const row of active.slice(0, META_ADS_MAX_ROWS)) {
      for (const [metaKey, key, label, kind] of ADS_ROW_METRICS) {
        const value = valueOf(row[metaKey], kind);
        if (value === null) continue;
        observations.push({ ...base, id: `${level.toLowerCase()}-${row[idField]}-${key}`, key, label, value, unit: unitOf(kind), entityLevel: level, entityId: String(row[idField]), entityName: String(row[nameField] || row[idField]), evidence: evidence(level === 'AD' ? 'resultados por anuncio' : 'resultados por campaña') });
      }
    }
  };
  rows(campaigns, 'CAMPAIGN', 'campaign_id', 'campaign_name');
  rows(ads, 'AD', 'ad_id', 'ad_name');

  return {
    sourceId: sourceId || `meta-ads-${account?.id || 'cuenta'}`, origin: META_API_ORIGIN, platform: 'META_ADS', screenType: 'META_API_ADS',
    originalName: `Pauta «${name}»${campaignFilter ? ` · campañas «${campaignFilter}»` : ''} · cifras de Meta`, declaredCategory: 'ADS', period, contextKey: 'advertising', confidence: 1, fetchedAt,
    ...(campaignFilter ? { campaignFilter } : {}), warnings, observations, panels: []
  };
};
