/**
 * Cliente de la Graph API de Meta para publicar en Instagram y Facebook (29 de septiembre de 2026).
 *
 * Habla solo con `graph.facebook.com`. Instagram publica en dos pasos —crear un contenedor con la URL
 * pública del archivo y, cuando Meta termina de procesarlo, publicarlo—; Facebook publica de una vez.
 * El token va siempre en el cuerpo, nunca en la URL: las URLs acaban en registros y el token no.
 * Todo lo que Meta contesta con `error` se convierte en `MetaGraphError`, con el código y el rastro
 * que Meta da, para que `humanizeMetaError` lo explique en español.
 */
export const META_GRAPH_VERSION = 'v25.0';
export const META_GRAPH_ORIGIN = 'https://graph.facebook.com';

const DEFAULT_TIMEOUT_MS = 60 * 1000;
/** Meta procesa un video en segundos o en varios minutos; un reel de 300 MB puede tardar. */
const DEFAULT_CONTAINER_WAIT_MS = 8 * 60 * 1000;
const DEFAULT_CONTAINER_POLL_MS = 5 * 1000;

export class MetaGraphError extends Error {
  constructor(message, { status = 0, code = null, subcode = null, type = null, fbtraceId = null, userMessage = null } = {}) {
    super(message);
    this.name = 'MetaGraphError';
    this.status = status;
    this.code = code;
    this.subcode = subcode;
    this.type = type;
    this.fbtraceId = fbtraceId;
    this.userMessage = userMessage;
  }
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formBody = (params) => {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    body.set(key, typeof value === 'boolean' ? String(value) : String(value));
  }
  return body;
};

export const createMetaGraphClient = ({
  fetchImpl = globalThis.fetch,
  version = META_GRAPH_VERSION,
  origin = META_GRAPH_ORIGIN,
  sleep = defaultSleep,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  containerWaitMs = DEFAULT_CONTAINER_WAIT_MS,
  containerPollMs = DEFAULT_CONTAINER_POLL_MS,
  now = () => Date.now()
} = {}) => {
  const base = `${origin}/${version}`;

  const parse = async (response) => {
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (payload?.error || !response.ok) {
      const meta = payload?.error || {};
      throw new MetaGraphError(meta.message || `Meta respondió ${response.status}`, {
        status: response.status || 0,
        code: meta.code ?? null,
        subcode: meta.error_subcode ?? null,
        type: meta.type ?? null,
        fbtraceId: meta.fbtrace_id ?? null,
        userMessage: meta.error_user_msg ?? null
      });
    }
    return payload;
  };

  const post = async (path, params) => {
    const response = await fetchImpl(`${base}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody(params),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs)
    });
    return parse(response);
  };

  const get = async (path, params) => {
    const query = formBody(params).toString();
    const response = await fetchImpl(`${base}/${path}?${query}`, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    return parse(response);
  };

  /** Espera hasta que el contenedor esté listo; ERROR/EXPIRED es definitivo, seguir esperando no lo arregla. */
  const waitForContainer = async ({ containerId, token }) => {
    const deadline = now() + containerWaitMs;
    for (;;) {
      const status = await get(containerId, { fields: 'status_code,status', access_token: token });
      const code = String(status?.status_code || '');
      if (code === 'FINISHED' || code === 'PUBLISHED') return status;
      if (code === 'ERROR' || code === 'EXPIRED') {
        throw new MetaGraphError(status?.status || `Meta dejó el contenedor en ${code}`, { status: 400, code: 'CONTAINER_ERROR' });
      }
      if (now() >= deadline) {
        throw new MetaGraphError('Meta no terminó de procesar el archivo a tiempo.', { status: 504, code: 'CONTAINER_TIMEOUT' });
      }
      await sleep(containerPollMs);
    }
  };

  const instagramPermalink = async ({ mediaId, token }) => {
    try {
      const media = await get(mediaId, { fields: 'id,permalink', access_token: token });
      return media?.permalink || null;
    } catch {
      // The post is already out; a missing permalink must not turn success into failure.
      return null;
    }
  };

  /**
   * `beforePublish` se llama justo antes de la llamada que publica de verdad (todo lo anterior —crear
   * contenedores, esperar a que Meta procese— se puede repetir sin consecuencias). Quien llama lo usa
   * para dejar constancia: si después de ese punto se pierde la respuesta, no se vuelve a publicar solo.
   */
  const publishToInstagram = async ({ igUserId, token, kind, caption = '', media = [], coverUrl = null, beforePublish = null }) => {
    let creationId;
    if (kind === 'CAROUSEL') {
      const children = [];
      for (const file of media) {
        const child = file.isVideo
          ? await post(`${igUserId}/media`, { media_type: 'VIDEO', video_url: file.url, is_carousel_item: true, access_token: token })
          : await post(`${igUserId}/media`, { image_url: file.url, is_carousel_item: true, access_token: token });
        children.push({ id: child.id, isVideo: Boolean(file.isVideo) });
      }
      for (const child of children) {
        if (child.isVideo) await waitForContainer({ containerId: child.id, token });
      }
      const parent = await post(`${igUserId}/media`, { media_type: 'CAROUSEL', children: children.map((child) => child.id).join(','), caption, access_token: token });
      creationId = parent.id;
      await waitForContainer({ containerId: creationId, token });
    } else if (kind === 'REELS') {
      const [file] = media;
      const container = await post(`${igUserId}/media`, { media_type: 'REELS', video_url: file.url, caption, share_to_feed: true, cover_url: coverUrl, access_token: token });
      creationId = container.id;
      await waitForContainer({ containerId: creationId, token });
    } else if (kind === 'STORIES') {
      const [file] = media;
      const container = file.isVideo
        ? await post(`${igUserId}/media`, { media_type: 'STORIES', video_url: file.url, access_token: token })
        : await post(`${igUserId}/media`, { media_type: 'STORIES', image_url: file.url, access_token: token });
      creationId = container.id;
      if (file.isVideo) await waitForContainer({ containerId: creationId, token });
    } else if (kind === 'IMAGE') {
      const [file] = media;
      const container = await post(`${igUserId}/media`, { image_url: file.url, caption, access_token: token });
      creationId = container.id;
    } else {
      throw new MetaGraphError(`Instagram no publica «${kind}».`, { status: 400, code: 'UNSUPPORTED_KIND' });
    }

    if (beforePublish) await beforePublish();
    const published = await post(`${igUserId}/media_publish`, { creation_id: creationId, access_token: token });
    const permalink = await instagramPermalink({ mediaId: published.id, token });
    return { mediaId: published.id, permalink };
  };

  const facebookPermalink = async ({ postId, token }) => {
    try {
      const post = await get(postId, { fields: 'permalink_url', access_token: token });
      return post?.permalink_url || null;
    } catch {
      return null;
    }
  };

  const publishToFacebookPage = async ({ pageId, token, kind, caption = '', media = [], beforePublish = null }) => {
    if (kind === 'IMAGE') {
      const [file] = media;
      if (beforePublish) await beforePublish();
      const photo = await post(`${pageId}/photos`, { url: file.url, message: caption, access_token: token });
      const postId = photo.post_id || photo.id;
      return { mediaId: postId, permalink: await facebookPermalink({ postId, token }) };
    }
    if (kind === 'REELS') {
      const [file] = media;
      if (beforePublish) await beforePublish();
      const video = await post(`${pageId}/videos`, { file_url: file.url, description: caption, access_token: token });
      return { mediaId: video.id, permalink: `https://www.facebook.com/${pageId}/videos/${video.id}` };
    }
    if (kind === 'CAROUSEL') {
      const uploaded = [];
      for (const file of media) {
        if (file.isVideo) throw new MetaGraphError('Facebook no admite videos dentro de una publicación con varias fotos.', { status: 400, code: 'UNSUPPORTED_KIND' });
        const photo = await post(`${pageId}/photos`, { url: file.url, published: false, access_token: token });
        uploaded.push(photo.id);
      }
      const params = { message: caption, access_token: token };
      uploaded.forEach((id, index) => { params[`attached_media[${index}]`] = JSON.stringify({ media_fbid: id }); });
      // Las fotos sin publicar no se ven; lo que publica es el post del feed.
      if (beforePublish) await beforePublish();
      const created = await post(`${pageId}/feed`, params);
      return { mediaId: created.id, permalink: await facebookPermalink({ postId: created.id, token }) };
    }
    throw new MetaGraphError(`Facebook no publica «${kind}» por la API.`, { status: 400, code: 'UNSUPPORTED_KIND' });
  };

  /** Páginas que el token puede administrar, con su Instagram profesional si lo tienen. */
  const listManagedPages = async (token) => {
    const pages = [];
    let path = 'me/accounts';
    let params = { fields: 'id,name,access_token,instagram_business_account{id,username}', limit: 100, access_token: token };
    for (let guard = 0; guard < 20; guard += 1) {
      const page = await get(path, params);
      for (const entry of page?.data || []) {
        pages.push({
          pageId: String(entry.id),
          pageName: entry.name || '',
          pageToken: entry.access_token || null,
          instagram: entry.instagram_business_account ? { id: String(entry.instagram_business_account.id), username: entry.instagram_business_account.username || '' } : null
        });
      }
      const after = page?.paging?.cursors?.after;
      if (!page?.paging?.next || !after) break;
      params = { ...params, after };
    }
    return pages;
  };

  const getInstagramPublishingLimit = async ({ igUserId, token }) => {
    const result = await get(`${igUserId}/content_publishing_limit`, { fields: 'quota_usage,config', access_token: token });
    const entry = result?.data?.[0] || {};
    return { used: Number(entry.quota_usage || 0), total: Number(entry.config?.quota_total || 100) };
  };

  return { publishToInstagram, publishToFacebookPage, listManagedPages, getInstagramPublishingLimit, waitForContainer };
};
