/**
 * Lo que la plataforma le pide a LinkedIn (23 de noviembre de 2026): autorizar una página de empresa,
 * subir archivos y crear publicaciones. Habla con www.linkedin.com (autorización) y api.linkedin.com
 * (todo lo demás) y con nada más; los archivos de la pieza se leen de su URL firmada.
 *
 * Formas de las llamadas leídas en la documentación de LinkedIn ese día (Community Management API):
 * `organizationAcls`, `organizations`, `images`, `videos` y `posts`, todas bajo `/rest` con las cabeceras
 * `LinkedIn-Version` y `X-Restli-Protocol-Version: 2.0.0`. LinkedIn retira cada versión más o menos al año:
 * la que se usa sale de `LINKEDIN_API_VERSION` y se cambia sin tocar el código.
 */
import { LINKEDIN_POSTING_ROLES, LINKEDIN_SCOPES, escapeLinkedInText, linkedinPostUrl } from '../lib/linkedinPublishing.js';

export const LINKEDIN_API_ORIGIN = 'https://api.linkedin.com';
export const LINKEDIN_AUTH_ORIGIN = 'https://www.linkedin.com';
/** La más reciente que listaba la página de versiones de LinkedIn el 23 de noviembre de 2026. */
export const LINKEDIN_DEFAULT_VERSION = '202605';

const DEFAULT_TIMEOUT_MS = 60 * 1000;
const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_PROCESSING_WAIT_MS = 8 * 60 * 1000;
const DEFAULT_PROCESSING_POLL_MS = 5 * 1000;
const defaultSleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

export class LinkedInError extends Error {
  constructor(message, { status = 0, code = null, serviceErrorCode = null } = {}) {
    super(message);
    this.name = 'LinkedInError';
    this.status = status;
    this.code = code;
    this.serviceErrorCode = serviceErrorCode;
  }
}

const encodeUrn = (urn) => encodeURIComponent(String(urn));
const organizationUrn = (id) => `urn:li:organization:${String(id).replace(/^urn:li:organization:/, '')}`;
const organizationIdOf = (urn) => String(urn || '').replace(/^urn:li:organization:/, '');

export const createLinkedInClient = ({
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
  now = () => Date.now(),
  env = process.env,
  apiOrigin = LINKEDIN_API_ORIGIN,
  authOrigin = LINKEDIN_AUTH_ORIGIN,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  processingWaitMs = DEFAULT_PROCESSING_WAIT_MS,
  processingPollMs = DEFAULT_PROCESSING_POLL_MS
} = {}) => {
  const clientId = () => String(env.LINKEDIN_CLIENT_ID || '').trim();
  const clientSecret = () => String(env.LINKEDIN_CLIENT_SECRET || '').trim();
  const version = () => String(env.LINKEDIN_API_VERSION || LINKEDIN_DEFAULT_VERSION).trim();
  // A dónde devuelve LinkedIn a la persona. Sale de la dirección desde la que se usa la plataforma (`origin`,
  // que las rutas ya validaron contra los orígenes permitidos): así vale para cada agencia sin configurar
  // nada. La primera prueba real (24 de noviembre de 2026) mandó `localhost` porque dependía de `APP_URL`,
  // que producción no define.
  const redirectUri = (origin) => String(env.LINKEDIN_OAUTH_REDIRECT_URI || `${String(origin || env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')}/linkedin/callback`).trim();
  const isConfigured = () => Boolean(clientId() && clientSecret());

  const parse = async (response) => {
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      throw new LinkedInError(payload?.message || payload?.error_description || `LinkedIn respondió ${response.status}`, {
        status: response.status || 0,
        code: payload?.code || payload?.error || null,
        serviceErrorCode: payload?.serviceErrorCode ?? null
      });
    }
    return { payload, headers: response.headers };
  };

  const apiHeaders = (token, extra = {}) => ({
    Authorization: `Bearer ${token}`,
    'LinkedIn-Version': version(),
    'X-Restli-Protocol-Version': '2.0.0',
    ...extra
  });

  // El token va siempre en la cabecera: las URL acaban en registros y el token no.
  const api = async (method, path, { token, body = null } = {}) => parse(await fetchImpl(`${apiOrigin}${path}`, {
    method,
    headers: apiHeaders(token, body ? { 'Content-Type': 'application/json' } : {}),
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs)
  }));

  const authorizationUrl = ({ state, redirectUri: target = redirectUri() }) => {
    const params = new URLSearchParams({ response_type: 'code', client_id: clientId(), redirect_uri: target, state, scope: LINKEDIN_SCOPES.join(' ') });
    return `${authOrigin}/oauth/v2/authorization?${params.toString()}`;
  };

  const tokenRequest = async (params) => {
    const { payload } = await parse(await fetchImpl(`${authOrigin}/oauth/v2/accessToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...params, client_id: clientId(), client_secret: clientSecret() }).toString(),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs)
    }));
    if (!payload?.access_token) throw new LinkedInError('LinkedIn no entregó un token de acceso.', { status: 502, code: 'NO_ACCESS_TOKEN' });
    return {
      accessToken: payload.access_token,
      expiresInSeconds: Number(payload.expires_in) || 0,
      refreshToken: payload.refresh_token || null,
      refreshExpiresInSeconds: Number(payload.refresh_token_expires_in) || 0,
      scope: String(payload.scope || '')
    };
  };

  // LinkedIn exige aquí la misma dirección de regreso que se le dio al salir.
  const exchangeCode = (code, { redirectUri: target = redirectUri() } = {}) => tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: target });
  const refreshAccessToken = (refreshToken) => tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });

  /** Las páginas de empresa donde quien autorizó puede publicar, con su nombre. */
  const listOrganizations = async (token) => {
    const { payload } = await api('GET', '/rest/organizationAcls?q=roleAssignee&state=APPROVED&count=100', { token });
    const ids = Array.from(new Set((payload?.elements || [])
      .filter((element) => LINKEDIN_POSTING_ROLES.includes(String(element.role || '')))
      // La documentación nombra el campo de dos maneras según el ejemplo.
      .map((element) => organizationIdOf(element.organization || element.organizationTarget))
      .filter(Boolean)));
    if (!ids.length) return [];
    let results = {};
    try {
      ({ payload: { results = {} } = {} } = await api('GET', `/rest/organizations?ids=List(${ids.join(',')})`, { token }));
    } catch {
      // Sin el detalle de administrador queda la consulta pública, que también trae el nombre.
      ({ payload: { results = {} } = {} } = await api('GET', `/rest/organizationsLookup?ids=List(${ids.join(',')})`, { token }).catch(() => ({ payload: { results: {} } })));
    }
    return ids.map((id) => ({
      organizationId: id,
      name: String(results?.[id]?.localizedName || `Página ${id}`),
      vanityName: results?.[id]?.vanityName || null
    })).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  };

  const readSource = async (url, { range = null } = {}) => {
    const response = await fetchImpl(url, { method: 'GET', headers: range ? { Range: `bytes=${range.first}-${range.last}` } : {}, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
    if (!response.ok) throw Object.assign(new Error(`No se pudo leer el archivo de la pieza (${response.status}).`), { permanent: false, status: response.status >= 500 ? response.status : 0 });
    return { buffer: Buffer.from(await response.arrayBuffer()), headers: response.headers };
  };

  const waitUntilAvailable = async ({ path, token }) => {
    const deadline = now() + processingWaitMs;
    for (;;) {
      const { payload } = await api('GET', path, { token });
      const status = String(payload?.status || '');
      if (status === 'AVAILABLE') return payload;
      if (status === 'PROCESSING_FAILED') throw new LinkedInError(payload?.processingFailureReason || 'LinkedIn no pudo procesar el archivo.', { status: 400, code: 'PROCESSING_FAILED' });
      if (now() >= deadline) throw new LinkedInError('LinkedIn no terminó de procesar el archivo a tiempo.', { status: 504, code: 'PROCESSING_TIMEOUT' });
      await sleep(processingPollMs);
    }
  };

  const uploadImage = async ({ token, owner, file }) => {
    const { payload } = await api('POST', '/rest/images?action=initializeUpload', { token, body: { initializeUploadRequest: { owner } } });
    const { uploadUrl, image } = payload?.value || {};
    if (!uploadUrl || !image) throw new LinkedInError('LinkedIn no abrió la subida de la imagen.', { status: 502, code: 'NO_UPLOAD_URL' });
    const { buffer } = await readSource(file.url);
    await parse(await fetchImpl(uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: buffer, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) }));
    await waitUntilAvailable({ path: `/rest/images/${encodeUrn(image)}`, token });
    return image;
  };

  /** El video se sube en las partes que LinkedIn indica (4 MB cada una), leyendo cada tramo del archivo por separado: nunca entero en memoria. */
  const uploadVideo = async ({ token, owner, file }) => {
    let size = Number(file.size || 0);
    if (!size) {
      const probe = await readSource(file.url, { range: { first: 0, last: 0 } });
      size = Number(String(probe.headers.get('content-range') || '').split('/')[1]) || 0;
    }
    if (!size) throw Object.assign(new Error(`No se pudo saber cuánto pesa «${file.name || 'el video'}».`), { permanent: true });
    const { payload } = await api('POST', '/rest/videos?action=initializeUpload', {
      token, body: { initializeUploadRequest: { owner, fileSizeBytes: size, uploadCaptions: false, uploadThumbnail: false } }
    });
    const { uploadInstructions = [], uploadToken = '', video } = payload?.value || {};
    if (!video || !uploadInstructions.length) throw new LinkedInError('LinkedIn no abrió la subida del video.', { status: 502, code: 'NO_UPLOAD_URL' });
    const uploadedPartIds = [];
    for (const part of uploadInstructions) {
      const { buffer } = await readSource(file.url, { range: { first: part.firstByte, last: part.lastByte } });
      const response = await fetchImpl(part.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: buffer, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
      if (!response.ok) throw new LinkedInError(`LinkedIn rechazó una parte del video (${response.status}).`, { status: response.status });
      const etag = response.headers.get('etag');
      if (!etag) throw new LinkedInError('LinkedIn no confirmó una parte del video.', { status: 502, code: 'NO_ETAG' });
      uploadedPartIds.push(etag);
    }
    await api('POST', '/rest/videos?action=finalizeUpload', { token, body: { finalizeUploadRequest: { video, uploadToken, uploadedPartIds } } });
    await waitUntilAvailable({ path: `/rest/videos/${encodeUrn(video)}`, token });
    return video;
  };

  /**
   * Publica en la página. Subir y esperar a que LinkedIn procese se puede repetir sin consecuencias;
   * `beforePublish` se llama justo antes de la única llamada que publica de verdad, igual que con Meta.
   */
  const publishToLinkedIn = async ({ organizationId, token, kind, text = '', media = [], title = '', beforePublish = null }) => {
    const owner = organizationUrn(organizationId);
    let content = null;
    if (kind === 'IMAGE') {
      content = { media: { id: await uploadImage({ token, owner, file: media[0] }) } };
    } else if (kind === 'MULTI_IMAGE') {
      const images = [];
      for (const file of media) images.push({ id: await uploadImage({ token, owner, file }) });
      content = { multiImage: { images } };
    } else if (kind === 'VIDEO') {
      content = { media: { id: await uploadVideo({ token, owner, file: media[0] }), ...(title ? { title: String(title).slice(0, 200) } : {}) } };
    } else if (kind !== 'TEXT') {
      throw new LinkedInError(`LinkedIn no publica «${kind}».`, { status: 400, code: 'UNSUPPORTED_KIND' });
    }

    if (beforePublish) await beforePublish();
    const { headers } = await api('POST', '/rest/posts', {
      token,
      body: {
        author: owner,
        commentary: escapeLinkedInText(text),
        visibility: 'PUBLIC',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        ...(content ? { content } : {}),
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false
      }
    });
    const postId = headers.get('x-restli-id') || null;
    return { mediaId: postId, permalink: linkedinPostUrl(postId) };
  };

  return { isConfigured, redirectUri, authorizationUrl, exchangeCode, refreshAccessToken, listOrganizations, publishToLinkedIn, uploadImage, uploadVideo };
};
