/**
 * Publicación en TikTok (Rodny, 25 de noviembre de 2026: «Listo, arranca», con aplicación propia). Lógica
 * pura, compartida por el servicio, las rutas y la pantalla: no toca la base ni la red.
 *
 * TikTok no es Meta ni LinkedIn, y aquí está lo que cambia (leído en su documentación el 24 de noviembre):
 *
 * - **Cada cuenta la autoriza su dueño**, como LinkedIn. La llave dura 24 horas y se renueva sola durante
 *   un año con el token de renovación; después hay que volver a autorizar.
 * - **TikTok dicta la pantalla de publicar.** Quién puede ver el video se elige cada vez **sin opción por
 *   defecto**; comentarios, dúo y pegar salen apagados; el contenido comercial se declara; y la persona
 *   acepta la confirmación de uso de música. Sin eso TikTok no aprueba la aplicación. Esas respuestas se
 *   guardan con la publicación programada (`SocialPublication.options`) y la cola publica lo que la
 *   persona confirmó, nunca un valor inventado.
 * - **Los datos de la cuenta se consultan en el momento** (qué privacidad admite, si deja comentar, cuánto
 *   puede durar el video): no se guardan, porque el dueño los cambia en su teléfono.
 * - **El video se sube por partes**, no se enlaza: enlazarlo exigiría verificar ante TikTok el dominio del
 *   almacenamiento, que cambia con cada agencia.
 * - **Por ahora solo video.** Las fotos y carruseles de TikTok solo se publican por enlace desde un dominio
 *   verificado; quedan para la siguiente fase.
 * - **Sin auditoría de TikTok** la aplicación solo publica en privado y en cuentas privadas.
 */

export const TIKTOK_PLATFORM = 'TIKTOK';

/** Lo que se le pide al dueño de la cuenta: ver su nombre, y publicar directo. */
export const TIKTOK_SCOPES = Object.freeze(['user.info.basic', 'video.publish']);

export const TIKTOK_TEXT_MAX_CHARS = 2200;
const MB = 1024 * 1024;
export const TIKTOK_VIDEO_MAX_BYTES = 4 * 1024 * MB;
export const TIKTOK_VIDEO_MIMES = Object.freeze(['video/mp4', 'video/quicktime', 'video/webm']);
/** Las partes de la subida: TikTok pide entre 5 y 64 MB cada una; un video de menos de 5 MB va entero. */
export const TIKTOK_CHUNK_BYTES = 10 * MB;
export const TIKTOK_MIN_CHUNK_BYTES = 5 * MB;
/** La llave de acceso se renueva cuando le queda menos de esto. Dura 24 horas. */
export const TIKTOK_RENEW_BEFORE_MS = 60 * 60 * 1000;
/** Se avisa en la ficha cuando a la autorización de un año le quedan menos días que estos. */
export const TIKTOK_REAUTH_WARNING_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Las privacidades que TikTok puede ofrecer, con el nombre que TikTok les da en su propia pantalla. */
export const TIKTOK_PRIVACY_LABELS = Object.freeze({
  PUBLIC_TO_EVERYONE: 'Todos',
  FOLLOWER_OF_CREATOR: 'Seguidores',
  MUTUAL_FOLLOW_FRIENDS: 'Amigos',
  SELF_ONLY: 'Solo yo'
});
export const TIKTOK_PRIVACY_LEVELS = Object.freeze(Object.keys(TIKTOK_PRIVACY_LABELS));

export const TIKTOK_MUSIC_CONFIRMATION_URL = 'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en';
export const TIKTOK_BRANDED_CONTENT_POLICY_URL = 'https://www.tiktok.com/legal/page/global/bc-policy/en';

const mimeOf = (asset) => String(asset?.mimeType || '').toLowerCase().split(';', 1)[0].trim();

/**
 * Lo que recibe TikTok a partir de lo que ya describe `describeMetaMedia`. Hoy solo un video.
 */
export const tiktokMedia = ({ kind, assets = [] }) => {
  const result = (tiktokKind, list, problem = null) => ({ kind: tiktokKind, assets: list, problem });
  if (kind === 'STORIES') return result(null, [], 'Una historia no se publica en TikTok desde la plataforma.');
  if (kind === 'IMAGE' || kind === 'CAROUSEL') return result(null, [], 'Por ahora a TikTok solo se envían videos; las fotos y carruseles llegarán después.');
  if (kind === 'REELS') {
    const [video] = assets;
    const name = video?.name || 'El video';
    if (!TIKTOK_VIDEO_MIMES.includes(mimeOf(video))) return result('VIDEO', assets, `«${name}» debe ser MP4, MOV o WebM para publicarse en TikTok.`);
    const size = Number(video?.size || 0);
    if (size > TIKTOK_VIDEO_MAX_BYTES) return result('VIDEO', assets, `«${name}» pesa ${Math.round(size / MB)} MB; TikTok acepta videos de hasta 4 GB.`);
    return result('VIDEO', assets);
  }
  return result(null, [], 'TikTok no publica este formato.');
};

/**
 * Cómo se parte el archivo. TikTok quiere `total_chunk_count = floor(tamaño / parte)` y que la última
 * parte se lleve el resto (puede pasar de la medida, hasta 128 MB). Un video menor de 5 MB va entero.
 */
export const tiktokChunkPlan = (size, chunkBytes = TIKTOK_CHUNK_BYTES) => {
  const total = Number(size || 0);
  if (!(total > 0)) return null;
  if (total < TIKTOK_MIN_CHUNK_BYTES || total <= chunkBytes) return { videoSize: total, chunkSize: total, totalChunkCount: 1, parts: [{ first: 0, last: total - 1 }] };
  const count = Math.floor(total / chunkBytes);
  const parts = [];
  for (let index = 0; index < count; index += 1) {
    const first = index * chunkBytes;
    parts.push({ first, last: index === count - 1 ? total - 1 : first + chunkBytes - 1 });
  }
  return { videoSize: total, chunkSize: chunkBytes, totalChunkCount: count, parts };
};

/**
 * Las respuestas de la persona, limpias. Lo que no viene queda **sin elegir** (privacidad) o **apagado**
 * (lo demás): nunca se rellena un valor que la persona no marcó.
 */
export const normalizeTikTokOptions = (raw) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const privacyLevel = TIKTOK_PRIVACY_LEVELS.includes(String(source.privacyLevel || '')) ? String(source.privacyLevel) : null;
  const commercial = source.commercial === true;
  return {
    privacyLevel,
    allowComment: source.allowComment === true,
    allowDuet: source.allowDuet === true,
    allowStitch: source.allowStitch === true,
    commercial,
    yourBrand: commercial && source.yourBrand === true,
    brandedContent: commercial && source.brandedContent === true,
    consent: source.consent === true
  };
};

/**
 * La frase que la persona acepta antes de publicar. Cambia según lo comercial, con el texto que pide TikTok.
 * `links` dice qué documentos se enlazan.
 */
export const tiktokConsentText = (options) => {
  const { brandedContent } = normalizeTikTokOptions(options);
  return brandedContent
    ? { text: 'Al publicar, aceptas la Política de contenido de marca y la Confirmación de uso de música de TikTok.', links: ['branded', 'music'] }
    : { text: 'Al publicar, aceptas la Confirmación de uso de música de TikTok.', links: ['music'] };
};

/** La etiqueta que TikTok le pondrá al video según lo comercial declarado. */
export const tiktokCommercialLabel = (options) => {
  const { commercial, yourBrand, brandedContent } = normalizeTikTokOptions(options);
  if (!commercial) return null;
  if (brandedContent) return 'Tu video se etiquetará como «Colaboración pagada».';
  if (yourBrand) return 'Tu video se etiquetará como «Contenido promocional».';
  return null;
};

/**
 * Lo que impide programar en TikTok con esas respuestas. Con `creatorInfo` (lo que TikTok dice de la
 * cuenta en ese momento) se comprueba además que lo elegido siga siendo posible.
 */
export const tiktokOptionProblems = (raw, { creatorInfo = null, durationSeconds = null } = {}) => {
  const options = normalizeTikTokOptions(raw);
  const problems = [];
  if (!options.privacyLevel) problems.push('Elige quién puede ver el video en TikTok.');
  if (options.commercial && !options.yourBrand && !options.brandedContent) problems.push('Indica si el contenido comercial promociona tu marca, la de un tercero o las dos.');
  if (options.brandedContent && options.privacyLevel === 'SELF_ONLY') problems.push('Una colaboración pagada no puede publicarse en TikTok como «Solo yo».');
  if (!options.consent) problems.push('Falta aceptar la Confirmación de uso de música de TikTok.');
  if (creatorInfo) {
    const allowed = Array.isArray(creatorInfo.privacyLevelOptions) ? creatorInfo.privacyLevelOptions : [];
    if (options.privacyLevel && allowed.length && !allowed.includes(options.privacyLevel)) {
      problems.push(`La cuenta de TikTok ya no admite publicar para «${TIKTOK_PRIVACY_LABELS[options.privacyLevel]}». Elige de nuevo quién puede verlo.`);
    }
    const max = Number(creatorInfo.maxVideoDurationSeconds || 0);
    if (max && Number(durationSeconds) > max) problems.push(`El video dura más de lo que TikTok le permite a esta cuenta (${Math.floor(max / 60)} min ${max % 60} s).`);
  }
  return problems;
};

/** Lo que se manda en `post_info`: los interruptores apagados por la cuenta se mandan apagados aunque estén marcados. */
export const tiktokPostInfo = ({ text = '', options: raw, creatorInfo = null }) => {
  const options = normalizeTikTokOptions(raw);
  return {
    title: String(text || '').slice(0, TIKTOK_TEXT_MAX_CHARS),
    privacy_level: options.privacyLevel,
    disable_comment: !options.allowComment || Boolean(creatorInfo?.commentDisabled),
    disable_duet: !options.allowDuet || Boolean(creatorInfo?.duetDisabled),
    disable_stitch: !options.allowStitch || Boolean(creatorInfo?.stitchDisabled),
    brand_organic_toggle: options.yourBrand,
    brand_content_toggle: options.brandedContent
  };
};

/** El enlace público del video, cuando TikTok lo da (solo si quedó visible para todos). */
export const tiktokVideoUrl = ({ username, postId }) => (username && postId ? `https://www.tiktok.com/@${encodeURIComponent(String(username).replace(/^@/, ''))}/video/${encodeURIComponent(String(postId))}` : null);

/**
 * Cómo está la autorización. La llave de acceso (24 h) la renueva la plataforma; lo que de verdad vence
 * es el token de renovación, al año.
 */
export const tiktokAuthorizationState = (account, now = new Date()) => {
  const meta = account?.metadata || account || {};
  const access = meta.expiresAt ? new Date(meta.expiresAt).getTime() : null;
  const refresh = meta.refreshExpiresAt ? new Date(meta.refreshExpiresAt).getTime() : null;
  const current = now.getTime();
  const hardStop = refresh ?? access;
  if (!hardStop) return { daysLeft: null, expired: false, expiringSoon: false, needsRefresh: false };
  const daysLeft = Math.floor((hardStop - current) / DAY_MS);
  return {
    daysLeft,
    expired: hardStop <= current,
    expiringSoon: hardStop > current && daysLeft < TIKTOK_REAUTH_WARNING_DAYS,
    needsRefresh: access == null || access - current < TIKTOK_RENEW_BEFORE_MS
  };
};

export const TIKTOK_RECONNECT_MESSAGE = 'La autorización de TikTok venció o fue retirada: el dueño de la cuenta tiene que volver a conectarla desde la ficha del cliente.';

const FAIL_REASONS = {
  file_format_check_failed: 'TikTok no aceptó el formato del video: revisa que sea MP4, MOV o WebM.',
  duration_check_failed: 'TikTok rechazó el video por su duración.',
  frame_rate_check_failed: 'TikTok rechazó el video por sus cuadros por segundo (admite de 23 a 60).',
  picture_size_check_failed: 'TikTok rechazó el video por su tamaño en pantalla (admite de 360 a 4096 px por lado).',
  video_pull_failed: 'TikTok no pudo recibir el video; se vuelve a intentar.',
  publish_cancelled: 'La publicación se canceló en TikTok.',
  auth_removed: TIKTOK_RECONNECT_MESSAGE,
  spam_risk_too_many_posts: 'La cuenta llegó al tope diario de publicaciones de TikTok. Vuelve a intentarlo mañana.',
  spam_risk_user_banned_from_posting: 'TikTok tiene bloqueada la publicación en esta cuenta.',
  spam_risk_text: 'TikTok rechazó el texto de la publicación por considerarlo riesgoso.',
  spam_risk: 'TikTok rechazó la publicación por considerarla riesgosa.'
};

/** Los fallos que no se arreglan reintentando. */
export const TIKTOK_PERMANENT_CODES = Object.freeze([
  'spam_risk_too_many_posts', 'spam_risk_user_banned_from_posting', 'spam_risk_text', 'spam_risk', 'reached_active_user_cap',
  'unaudited_client_can_only_post_to_private_accounts', 'privacy_level_option_mismatch', 'invalid_params', 'scope_not_authorized',
  'file_format_check_failed', 'duration_check_failed', 'frame_rate_check_failed', 'picture_size_check_failed', 'publish_cancelled',
  'access_token_invalid', 'auth_removed', 'url_ownership_unverified'
]);

/** El motivo de un fallo de TikTok, en español y diciendo qué hacer. */
export const humanizeTikTokError = (error) => {
  if (!error) return 'TikTok no respondió.';
  const status = Number(error.status || 0);
  const code = String(error.code || '');
  const message = String(error.message || '').trim();
  if (FAIL_REASONS[code]) return FAIL_REASONS[code];
  if (code === 'access_token_invalid' || code === 'invalid_grant' || status === 401) return TIKTOK_RECONNECT_MESSAGE;
  if (code === 'scope_not_authorized') return 'La cuenta de TikTok no dio permiso de publicar. Vuelve a conectarla desde la ficha del cliente y acepta el permiso.';
  if (code === 'unaudited_client_can_only_post_to_private_accounts') return 'TikTok todavía no ha aprobado la aplicación: por ahora solo publica en cuentas privadas y con «Solo yo».';
  if (code === 'reached_active_user_cap') return 'La aplicación llegó al tope diario de cuentas que TikTok le permite. Vuelve a intentarlo mañana.';
  if (code === 'privacy_level_option_mismatch') return 'La cuenta de TikTok ya no admite la privacidad elegida. Elige de nuevo quién puede ver el video y vuelve a programar.';
  if (code === 'rate_limit_exceeded' || status === 429) return 'TikTok puso un límite temporal; se vuelve a intentar en unos minutos.';
  if (code === 'PROCESSING_TIMEOUT') return 'TikTok no terminó de procesar el video a tiempo.';
  if (status >= 500 || !status) return 'No se pudo llegar a TikTok; se vuelve a intentar.';
  return message ? `TikTok respondió: ${message}` : 'TikTok respondió con un error sin detalle.';
};
