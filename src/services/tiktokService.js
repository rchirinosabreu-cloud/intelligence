/**
 * Lo que la plataforma le pide a TikTok (25 de noviembre de 2026): autorizar una cuenta, leer lo que esa
 * cuenta permite en ese momento, subir un video por partes y saber si quedó publicado. Habla con
 * www.tiktok.com (autorización) y open.tiktokapis.com (todo lo demás) y con nada más; el archivo de la
 * pieza se lee de su URL firmada, por rangos, para no cargarlo entero en memoria.
 *
 * Formas de las llamadas leídas en la documentación de TikTok el 24 de noviembre de 2026 (Login Kit y
 * Content Posting API): `/v2/oauth/token/`, `/v2/user/info/`, `/v2/post/publish/creator_info/query/`,
 * `/v2/post/publish/video/init/` con `FILE_UPLOAD`, y `/v2/post/publish/status/fetch/`.
 */
import { TIKTOK_PERMANENT_CODES, TIKTOK_SCOPES, tiktokChunkPlan, tiktokPostInfo, tiktokVideoUrl } from '../lib/tiktokPublishing.js';

export const TIKTOK_API_ORIGIN = 'https://open.tiktokapis.com';
export const TIKTOK_AUTH_ORIGIN = 'https://www.tiktok.com';

const DEFAULT_TIMEOUT_MS = 60 * 1000;
const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_PROCESSING_WAIT_MS = 8 * 60 * 1000;
const DEFAULT_PROCESSING_POLL_MS = 5 * 1000;
const defaultSleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

export class TikTokError extends Error {
  constructor(message, { status = 0, code = null, logId = null, permanent = undefined } = {}) {
    super(message);
    this.name = 'TikTokError';
    this.status = status;
    this.code = code;
    this.logId = logId;
    // Lo que TikTok rechaza por la cuenta, el permiso o el archivo no se arregla repitiendo la llamada.
    if (permanent ?? TIKTOK_PERMANENT_CODES.includes(String(code || ''))) this.permanent = true;
  }
}

export const createTikTokClient = ({
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
  now = () => Date.now(),
  env = process.env,
  apiOrigin = TIKTOK_API_ORIGIN,
  authOrigin = TIKTOK_AUTH_ORIGIN,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  processingWaitMs = DEFAULT_PROCESSING_WAIT_MS,
  processingPollMs = DEFAULT_PROCESSING_POLL_MS
} = {}) => {
  const clientKey = () => String(env.TIKTOK_CLIENT_KEY || '').trim();
  const clientSecret = () => String(env.TIKTOK_CLIENT_SECRET || '').trim();
  // A dónde devuelve TikTok a la persona: la dirección desde la que se usa la plataforma, ya validada por
  // las rutas contra los orígenes permitidos. Nunca depende de `APP_URL`, que producción no define.
  const redirectUri = (origin) => String(env.TIKTOK_OAUTH_REDIRECT_URI || `${String(origin || env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')}/tiktok/callback`).trim();
  const isConfigured = () => Boolean(clientKey() && clientSecret());

  const readJson = async (response) => {
    try {
      return await response.json();
    } catch {
      return null;
    }
  };

  /** TikTok responde `{ data, error: { code, message, log_id } }`; `code: "ok"` es el único éxito. */
  const api = async (method, path, { token, body = null } = {}) => {
    const response = await fetchImpl(`${apiOrigin}${path}`, {
      method,
      // El token va siempre en la cabecera: las URL acaban en registros y el token no.
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json; charset=UTF-8' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs)
    });
    const payload = await readJson(response);
    const code = payload?.error?.code;
    if (!response.ok || (code && code !== 'ok')) {
      throw new TikTokError(payload?.error?.message || `TikTok respondió ${response.status}`, {
        status: response.ok ? 400 : (response.status || 0), code: code || null, logId: payload?.error?.log_id || null
      });
    }
    return payload?.data || {};
  };

  const authorizationUrl = ({ state, redirectUri: target = redirectUri() }) => {
    const params = new URLSearchParams({ client_key: clientKey(), scope: TIKTOK_SCOPES.join(','), response_type: 'code', redirect_uri: target, state });
    return `${authOrigin}/v2/auth/authorize/?${params.toString()}`;
  };

  const tokenRequest = async (params) => {
    const response = await fetchImpl(`${apiOrigin}/v2/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
      body: new URLSearchParams({ ...params, client_key: clientKey(), client_secret: clientSecret() }).toString(),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs)
    });
    const payload = await readJson(response);
    // Este punto devuelve el error arriba del todo (`error`, `error_description`), a veces con un 200.
    if (!response.ok || payload?.error || !payload?.access_token) {
      throw new TikTokError(payload?.error_description || 'TikTok no entregó un token de acceso.', {
        status: response.ok ? 400 : (response.status || 0), code: payload?.error || 'NO_ACCESS_TOKEN', logId: payload?.log_id || null
      });
    }
    return {
      accessToken: payload.access_token,
      expiresInSeconds: Number(payload.expires_in) || 0,
      refreshToken: payload.refresh_token || null,
      refreshExpiresInSeconds: Number(payload.refresh_expires_in) || 0,
      openId: String(payload.open_id || ''),
      scope: String(payload.scope || '')
    };
  };

  // TikTok exige aquí la misma dirección de regreso que se le dio al salir.
  const exchangeCode = (code, { redirectUri: target = redirectUri() } = {}) => tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: target });
  const refreshAccessToken = (refreshToken) => tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });

  /** Quién autorizó: su identificador para esta aplicación y el nombre que muestra. */
  const userInfo = async (token) => {
    const { user = {} } = await api('GET', '/v2/user/info/?fields=open_id,display_name,avatar_url', { token });
    return { openId: String(user.open_id || ''), displayName: String(user.display_name || ''), avatarUrl: user.avatar_url || null };
  };

  /** Lo que la cuenta permite **ahora**. Se pregunta al abrir la pantalla y otra vez justo antes de publicar. */
  const creatorInfo = async (token) => {
    const data = await api('POST', '/v2/post/publish/creator_info/query/', { token, body: {} });
    return {
      username: String(data.creator_username || ''),
      nickname: String(data.creator_nickname || ''),
      avatarUrl: data.creator_avatar_url || null,
      privacyLevelOptions: Array.isArray(data.privacy_level_options) ? data.privacy_level_options.map(String) : [],
      commentDisabled: Boolean(data.comment_disabled),
      duetDisabled: Boolean(data.duet_disabled),
      stitchDisabled: Boolean(data.stitch_disabled),
      maxVideoDurationSeconds: Number(data.max_video_post_duration_sec) || 0
    };
  };

  const readSource = async (url, { range = null } = {}) => {
    const response = await fetchImpl(url, { method: 'GET', headers: range ? { Range: `bytes=${range.first}-${range.last}` } : {}, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
    if (!response.ok) throw Object.assign(new Error(`No se pudo leer el archivo de la pieza (${response.status}).`), { permanent: false, status: response.status >= 500 ? response.status : 0 });
    return { buffer: Buffer.from(await response.arrayBuffer()), headers: response.headers };
  };

  const publishStatus = async ({ token, publishId }) => {
    const data = await api('POST', '/v2/post/publish/status/fetch/', { token, body: { publish_id: publishId } });
    // El campo viene escrito así en la documentación de TikTok («publicaly»); se lee también bien escrito.
    const ids = data.publicaly_available_post_id || data.publicly_available_post_id || [];
    return { status: String(data.status || ''), failReason: data.fail_reason || null, postId: Array.isArray(ids) && ids.length ? String(ids[0]) : null };
  };

  const waitUntilPublished = async ({ token, publishId }) => {
    const deadline = now() + processingWaitMs;
    for (;;) {
      const state = await publishStatus({ token, publishId });
      if (state.status === 'PUBLISH_COMPLETE') return state;
      if (state.status === 'FAILED') throw new TikTokError(`TikTok no publicó el video (${state.failReason || 'sin motivo'}).`, { status: 400, code: state.failReason || 'PUBLISH_FAILED', permanent: state.failReason !== 'video_pull_failed' && state.failReason !== 'internal' });
      // A tiempo vencido no se sabe si saldrá: es un fallo de los que la cola no repite sola.
      if (now() >= deadline) throw new TikTokError('TikTok no terminó de procesar el video a tiempo.', { status: 504, code: 'PROCESSING_TIMEOUT' });
      await sleep(processingPollMs);
    }
  };

  /**
   * Publica un video en la cuenta. Abrir la subida y mandar las primeras partes se puede repetir sin
   * consecuencias (una subida sin terminar no publica nada); `beforePublish` se llama justo antes de la
   * **última parte**, que es la que hace que TikTok publique.
   */
  const publishVideo = async ({ token, file, text = '', options, creator = null, beforePublish = null }) => {
    let size = Number(file.size || 0);
    if (!size) {
      const probe = await readSource(file.url, { range: { first: 0, last: 0 } });
      size = Number(String(probe.headers.get('content-range') || '').split('/')[1]) || 0;
    }
    const plan = tiktokChunkPlan(size);
    if (!plan) throw Object.assign(new Error(`No se pudo saber cuánto pesa «${file.name || 'el video'}».`), { permanent: true });

    const opened = await api('POST', '/v2/post/publish/video/init/', {
      token,
      body: {
        post_info: tiktokPostInfo({ text, options, creatorInfo: creator }),
        source_info: { source: 'FILE_UPLOAD', video_size: plan.videoSize, chunk_size: plan.chunkSize, total_chunk_count: plan.totalChunkCount }
      }
    });
    const publishId = opened.publish_id;
    const uploadUrl = opened.upload_url;
    if (!publishId || !uploadUrl) throw new TikTokError('TikTok no abrió la subida del video.', { status: 502, code: 'NO_UPLOAD_URL' });

    const contentType = String(file.mimeType || 'video/mp4');
    for (const [index, part] of plan.parts.entries()) {
      const { buffer } = await readSource(file.url, { range: part });
      if (index === plan.parts.length - 1 && beforePublish) await beforePublish();
      const response = await fetchImpl(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType, 'Content-Length': String(buffer.length), 'Content-Range': `bytes ${part.first}-${part.last}/${plan.videoSize}` },
        body: buffer,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS)
      });
      if (!response.ok) throw new TikTokError(`TikTok rechazó una parte del video (${response.status}).`, { status: response.status });
    }

    const done = await waitUntilPublished({ token, publishId });
    return { mediaId: done.postId || publishId, permalink: tiktokVideoUrl({ username: creator?.username, postId: done.postId }) };
  };

  return { isConfigured, redirectUri, authorizationUrl, exchangeCode, refreshAccessToken, userInfo, creatorInfo, publishStatus, publishVideo };
};
