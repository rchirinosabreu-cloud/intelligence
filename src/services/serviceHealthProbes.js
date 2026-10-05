import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Storage } from '@google-cloud/storage';
import nodemailer from 'nodemailer';
import prisma from '../lib/prisma.js';
import { AI_MODELS } from '../config/aiConfig.js';
import { META_GRAPH_ORIGIN, META_GRAPH_VERSION } from './metaGraphService.js';
import { fetchOfficialUsdCopRate } from './exchangeRateService.js';
import { classifyHttpFailure, classifyNetworkFailure } from '../lib/serviceHealth.js';

/**
 * Las comprobaciones del semáforo de servicios (4 de octubre de 2026).
 *
 * Todas son de solo lectura y gratuitas: a OpenAI se le pregunta si existe el modelo, a Fireflies
 * quién es el usuario, a Meta de quién es el token, a cada bucket si existe, al correo solo se le
 * inicia sesión. Nunca se envía contenido a un proveedor de IA, por eso no pasan por `governedFetch`
 * ni ensucian el registro de uso de IA; su rastro queda en `ServiceHealthCheck`.
 *
 * Además del chequeo activo, algunas miran el uso real (llamadas fallidas, minutas esperando a la IA,
 * cuentas de clientes que piden reconectar): un proveedor puede contestar a la pregunta fácil y
 * fallar en el trabajo de verdad. Si esa lectura falla, se ignora: no puede tumbar la comprobación.
 */

const PROBE_TIMEOUT_MS = 10 * 1000;
const RECENT_USAGE_MS = 15 * 60 * 1000;
const MIN_CALLS_FOR_ERROR_RATE = 5;
const ERROR_RATE_WARN = 0.3;
const SLOW = { database: 2000, http: 5000 };
const CALENDAR_STALE_MS = 30 * 60 * 1000;
const TRM_STALE_DAYS = 5;

const result = (status, message, extra = {}) => ({ status, message, critical: false, errorCode: null, ...extra });
const notConfigured = (message) => result('NOT_CONFIGURED', message);
const fail = (failure) => result('FAIL', failure.message, { critical: failure.critical, errorCode: failure.errorCode });

const withTimeout = (promise, ms = PROBE_TIMEOUT_MS) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), ms);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const readJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const plural = (count, singular, pluralForm) => `${count} ${count === 1 ? singular : pluralForm}`;

const s3ErrorFailure = (error, bucket) => {
  const status = error?.$metadata?.httpStatusCode;
  if (status === 404 || error?.name === 'NotFound' || error?.name === 'NoSuchBucket') {
    return { critical: true, errorCode: 'HTTP_404', message: `El bucket «${bucket}» no existe.` };
  }
  if (status) return classifyHttpFailure(status);
  return classifyNetworkFailure(error);
};

export const createServiceHealthProbes = ({
  env = process.env,
  db = prisma,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  clock = () => Date.now(),
  createS3Client = (config) => new S3Client({
    endpoint: config.endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
  }),
  createGcsClient = ({ projectId, credentials }) => new Storage({ projectId, credentials }),
  createMailTransport = (config) => nodemailer.createTransport(config),
  fetchTrm = () => fetchOfficialUsdCopRate()
} = {}) => {
  const safe = async (read) => {
    try {
      return await read();
    } catch {
      return null;
    }
  };

  const timed = async (run) => {
    const startedAt = clock();
    const value = await run();
    return { value, latencyMs: Math.max(0, Math.round(clock() - startedAt)) };
  };

  const get = (url, headers) => fetchImpl(url, { method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });

  /** Cuántas llamadas reales a este proveedor fallaron en el último cuarto de hora. */
  const recentErrorRate = async (provider) => {
    const rows = await safe(() => db.aiUsageEvent.groupBy({
      by: ['outcome'],
      where: { provider, occurredAt: { gte: new Date(now().getTime() - RECENT_USAGE_MS) } },
      _count: { _all: true }
    }));
    if (!rows) return null;
    // Una llamada bloqueada por el gobierno de IA no es una caída del proveedor.
    const total = rows.filter((row) => row.outcome !== 'BLOCKED').reduce((sum, row) => sum + row._count._all, 0);
    const errors = rows.find((row) => row.outcome === 'ERROR')?._count._all || 0;
    if (total < MIN_CALLS_FOR_ERROR_RATE || errors / total < ERROR_RATE_WARN) return null;
    return `${errors} de ${total} llamadas reales fallaron en los últimos 15 minutos.`;
  };

  const slowOrOk = (latencyMs, threshold, okMessage) => (latencyMs > threshold
    ? result('WARN', `Responde, pero lento (${(latencyMs / 1000).toFixed(1)} s).`, { latencyMs })
    : result('OK', okMessage, { latencyMs }));

  const s3Probe = async ({ endpoint, accessKeyId, secretAccessKey, bucket }) => {
    if (!accessKeyId || !secretAccessKey || !bucket) return null;
    const client = createS3Client({ endpoint, accessKeyId, secretAccessKey });
    try {
      const { latencyMs } = await timed(() => withTimeout(client.send(new HeadBucketCommand({ Bucket: bucket }))));
      return slowOrOk(latencyMs, SLOW.http, `El bucket «${bucket}» responde.`);
    } catch (error) {
      return fail(s3ErrorFailure(error, bucket));
    }
  };

  const probes = {
    async database() {
      const { latencyMs } = await timed(() => withTimeout(db.$queryRaw`SELECT 1`));
      return slowOrOk(latencyMs, SLOW.database, 'Responde con normalidad.');
    },

    async openai() {
      if (!env.OPENAI_API_KEY) return notConfigured('Falta la clave de OpenAI.');
      const model = AI_MODELS.fast;
      const { value: response, latencyMs } = await timed(() => get(
        `https://api.openai.com/v1/models/${encodeURIComponent(model)}`,
        { Authorization: `Bearer ${env.OPENAI_API_KEY}` }
      ));
      if (!response.ok) {
        const body = await readJson(response);
        if (response.status === 404) return fail({ critical: true, errorCode: 'HTTP_404', message: `El modelo «${model}» no existe o la cuenta no tiene acceso.` });
        return fail(classifyHttpFailure(response.status, { code: body?.error?.code }));
      }
      const [errorRate, waitingMinutes] = await Promise.all([
        recentErrorRate('openai'),
        safe(() => db.meetingMinute.count({ where: { status: 'PENDING_PROVIDER' } }))
      ]);
      if (errorRate) return result('WARN', errorRate, { latencyMs });
      if (waitingMinutes > 0) {
        return result('WARN', `${plural(waitingMinutes, 'minuta espera', 'minutas esperan')} a que la IA vuelva a atender.`, { latencyMs });
      }
      return slowOrOk(latencyMs, SLOW.http, 'Responde con normalidad.');
    },

    async fireflies() {
      if (!env.FIREFLIES_API_KEY) return notConfigured('Falta la clave de Fireflies.');
      const { value: response, latencyMs } = await timed(() => fetchImpl('https://api.fireflies.ai/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.FIREFLIES_API_KEY}` },
        body: JSON.stringify({ query: '{ user { user_id } }' }),
        redirect: 'error',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
      }));
      const body = await readJson(response);
      if (!response.ok) return fail(classifyHttpFailure(response.status));
      if (body?.errors?.length) {
        const code = String(body.errors[0]?.extensions?.code || '');
        const auth = /auth|api_key|forbidden|unauth/i.test(`${code} ${body.errors[0]?.message || ''}`);
        return fail(auth
          ? { critical: true, errorCode: 'AUTH', message: 'Fireflies rechazó la clave: hay que revisarla.' }
          : { critical: false, errorCode: 'GRAPHQL', message: 'Fireflies respondió con un error.' });
      }
      const errorRate = await recentErrorRate('fireflies');
      if (errorRate) return result('WARN', errorRate, { latencyMs });
      return slowOrOk(latencyMs, SLOW.http, 'Responde con normalidad.');
    },

    async 'google-calendar'() {
      if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) return notConfigured('Faltan las credenciales de Google.');
      // La sincronización corre cada 5 minutos y marca la cuenta en cuanto Google la rechaza: leer ese
      // estado dice lo mismo que preguntarle a Google, sin gastar una llamada más.
      const connections = await db.googleCalendarConnection.findMany({ select: { email: true, isActive: true, lastSyncedAt: true } });
      if (!connections.length) return notConfigured('No hay ninguna cuenta de Google conectada.');
      const active = connections.filter((connection) => connection.isActive);
      const inactive = connections.filter((connection) => !connection.isActive);
      if (!active.length) {
        return fail({ critical: true, errorCode: 'REAUTH_REQUIRED', message: 'Todas las cuentas de Google piden volver a conectarse.' });
      }
      if (inactive.length) {
        return result('WARN', `Pide volver a conectarse: ${inactive.map((connection) => connection.email).join(', ')}.`);
      }
      const lastSync = Math.max(...active.map((connection) => (connection.lastSyncedAt ? new Date(connection.lastSyncedAt).getTime() : 0)));
      if (!lastSync || now().getTime() - lastSync > CALENDAR_STALE_MS) {
        return result('WARN', 'La sincronización con Google no ha corrido en la última media hora.');
      }
      return result('OK', `${plural(active.length, 'cuenta conectada', 'cuentas conectadas')} y sincronizando.`);
    },

    async 'google-storage'() {
      if (!env.GOOGLE_APPLICATION_CREDENTIALS_JSON || !env.GOOGLE_CLOUD_PROJECT) return notConfigured('Faltan las credenciales de Google Cloud.');
      let credentials;
      try {
        credentials = JSON.parse(env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
      } catch {
        return fail({ critical: true, errorCode: 'BAD_CREDENTIALS', message: 'Las credenciales de Google Cloud no son un JSON válido.' });
      }
      const bucketName = env.GCS_BUCKET_NAME || 'brainstudio-unstructured-v2';
      const client = createGcsClient({ projectId: env.GOOGLE_CLOUD_PROJECT, credentials });
      try {
        const { value: [exists], latencyMs } = await timed(() => withTimeout(client.bucket(bucketName).exists()));
        if (!exists) return fail({ critical: true, errorCode: 'HTTP_404', message: `El bucket «${bucketName}» no existe.` });
        return slowOrOk(latencyMs, SLOW.http, `El bucket «${bucketName}» responde.`);
      } catch (error) {
        const status = Number(error?.code);
        return fail(Number.isInteger(status) && status >= 400 ? classifyHttpFailure(status) : classifyNetworkFailure(error));
      }
    },

    async meta() {
      if (!env.META_SYSTEM_USER_TOKEN) return notConfigured('Falta el token del usuario del sistema de Meta.');
      // El token va en la cabecera: las URLs acaban en registros y el token no.
      const { value: response, latencyMs } = await timed(() => get(
        `${META_GRAPH_ORIGIN}/${META_GRAPH_VERSION}/me?fields=id,name`,
        { Authorization: `Bearer ${env.META_SYSTEM_USER_TOKEN}` }
      ));
      const body = await readJson(response);
      if (!response.ok || body?.error) {
        if (body?.error?.code === 190 || body?.error?.code === 102) {
          return fail({ critical: true, errorCode: 'META_TOKEN_INVALID', message: 'El token de Meta venció o fue revocado: hay que generar otro.' });
        }
        return fail(classifyHttpFailure(response.status || 500));
      }
      const disconnected = await safe(() => db.clientSocialAccount.count({ where: { isActive: false, lastError: { not: null } } }));
      if (disconnected > 0) {
        return result('WARN', `${plural(disconnected, 'cuenta de cliente pide', 'cuentas de clientes piden')} volver a conectarse.`, { latencyMs });
      }
      return slowOrOk(latencyMs, SLOW.http, 'El token es válido.');
    },

    async 'storage-chat'() {
      const outcome = await s3Probe({
        endpoint: env.AWS_ENDPOINT_URL || 'https://t3.storageapi.dev',
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        bucket: env.AWS_S3_BUCKET_NAME || 'chat-evidence'
      });
      return outcome || notConfigured('Faltan las credenciales del almacenamiento.');
    },

    async 'storage-memory'() {
      const ownBucket = env.BRIA_STORAGE_BUCKET;
      const outcome = await s3Probe({
        endpoint: env.BRIA_STORAGE_ENDPOINT || env.AWS_ENDPOINT_URL || 'https://t3.storageapi.dev',
        accessKeyId: env.BRIA_STORAGE_ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.BRIA_STORAGE_SECRET_ACCESS_KEY || env.AWS_SECRET_ACCESS_KEY,
        bucket: ownBucket || env.AWS_S3_BUCKET_NAME
      });
      if (!outcome) return notConfigured('Faltan las credenciales de la memoria de la agencia.');
      if (outcome.status === 'OK' && !ownBucket) {
        return result('WARN', 'Usa el bucket compartido del chat, que se purga solo: falta BRIA_STORAGE_BUCKET.', { latencyMs: outcome.latencyMs });
      }
      return outcome;
    },

    async 'storage-financial'() {
      const bucket = env.FINANCIAL_EVIDENCE_BUCKET_NAME;
      if (bucket && bucket === (env.AWS_S3_BUCKET_NAME || 'chat-evidence')) {
        return fail({ critical: true, errorCode: 'SHARED_BUCKET', message: 'Apunta al bucket del chat, que se purga solo; los soportes necesitan el suyo.' });
      }
      const outcome = await s3Probe({
        endpoint: env.FINANCIAL_EVIDENCE_ENDPOINT_URL || env.AWS_ENDPOINT_URL || 'https://t3.storageapi.dev',
        accessKeyId: env.FINANCIAL_EVIDENCE_ACCESS_KEY_ID,
        secretAccessKey: env.FINANCIAL_EVIDENCE_SECRET_ACCESS_KEY,
        bucket
      });
      return outcome || notConfigured('Faltan las credenciales de los soportes financieros.');
    },

    async email() {
      const user = env.SMTP_USER || env.GMAIL_SMTP_USER;
      const pass = env.SMTP_PASS || env.GMAIL_SMTP_PASS;
      if (!user || !pass) return notConfigured('Falta el usuario o la contraseña del correo.');
      const port = Number(env.SMTP_PORT || 465);
      const transport = createMailTransport({ host: env.SMTP_HOST || 'smtp.gmail.com', port, secure: port === 465, auth: { user, pass } });
      try {
        // `verify` se conecta e inicia sesión; no envía ningún correo.
        const { latencyMs } = await timed(() => withTimeout(transport.verify()));
        return slowOrOk(latencyMs, SLOW.http, 'Inicia sesión con normalidad.');
      } catch (error) {
        if (error?.code === 'EAUTH') {
          return fail({ critical: true, errorCode: 'EAUTH', message: 'El servidor de correo rechazó el usuario o la contraseña.' });
        }
        return fail(classifyNetworkFailure(error));
      } finally {
        transport.close?.();
      }
    },

    async push() {
      const configured = Boolean(env.WEB_PUSH_PUBLIC_KEY && env.WEB_PUSH_PRIVATE_KEY && /^(mailto:|https?:\/\/)/i.test(String(env.WEB_PUSH_SUBJECT || '').trim()));
      if (!configured) return notConfigured('Faltan las claves de notificaciones push.');
      // No existe forma de comprobar el envío sin mandar un aviso: se mira cómo les va a los dispositivos.
      const [active, failing] = await Promise.all([
        db.pushSubscription.count({ where: { isActive: true } }),
        db.pushSubscription.count({ where: { isActive: true, failureCount: { gt: 0 } } })
      ]);
      if (active >= 3 && failing / active > 0.5) {
        return result('WARN', `${failing} de ${active} dispositivos fallan al recibir avisos.`);
      }
      return result('OK', active
        ? `${plural(active, 'dispositivo registrado', 'dispositivos registrados')}.`
        : 'Configurado; todavía no hay dispositivos registrados.');
    },

    async trm() {
      const { value: rate, latencyMs } = await timed(() => withTimeout(fetchTrm()));
      const validFrom = new Date(rate.validFrom);
      const days = (now().getTime() - validFrom.getTime()) / (24 * 60 * 60 * 1000);
      if (!Number.isFinite(days) || days > TRM_STALE_DAYS) {
        return result('WARN', `La última TRM publicada es vieja (${String(rate.validFrom).slice(0, 10)}).`, { latencyMs });
      }
      return slowOrOk(latencyMs, SLOW.http, `TRM vigente: ${Math.round(rate.rate).toLocaleString('es-CO')}.`);
    }
  };

  // Ninguna comprobación puede reventar: lo que lance se convierte en un fallo explicado.
  return Object.fromEntries(Object.entries(probes).map(([id, probe]) => [id, async () => {
    try {
      return await probe();
    } catch (error) {
      return fail(classifyNetworkFailure(error));
    }
  }]));
};
