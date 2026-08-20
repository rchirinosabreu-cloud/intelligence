import prisma from '../lib/prisma.js';

let cachedResult = null;
let cachedAt = 0;

const withTimeout = (promise, timeoutMs) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('SERVICE_CHECK_TIMEOUT')), timeoutMs);
  Promise.resolve(promise).then(
    value => { clearTimeout(timer); resolve(value); },
    error => { clearTimeout(timer); reject(error); }
  );
});

const hasGoogleCredentials = (env) => Boolean(env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

export const createDefaultServiceProbes = (env = process.env) => [
  { id: 'application', name: 'Aplicación', check: async () => true },
  { id: 'database', name: 'Base de datos', configured: Boolean(env.DATABASE_URL), check: async () => {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } },
  { id: 'openai', name: 'OpenAI', configured: Boolean(env.OPENAI_API_KEY), check: async () => {
    const response = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` } });
    return response.ok;
  } },
  { id: 'google_workspace', name: 'Google Workspace', configured: hasGoogleCredentials(env), check: async () => {
    const [{ JWT }, { default: credentials }] = await Promise.all([
      import('google-auth-library'),
      import('../lib/googleCredentials.js')
    ]);
    const client = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      subject: env.GOOGLE_WORKSPACE_SUBJECT || env.GOOGLE_CALENDAR_ID || 'contacto@brainstudioagencia.com',
      scopes: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/cloud-platform'
      ]
    });
    await client.authorize();
    return true;
  } },
  { id: 'cloud_storage', name: 'Google Cloud Storage', configured: hasGoogleCredentials(env), check: async () => {
    const [{ Storage }, { default: credentials }] = await Promise.all([
      import('@google-cloud/storage'),
      import('../lib/googleCredentials.js')
    ]);
    const storage = new Storage({ projectId: env.GOOGLE_CLOUD_PROJECT || credentials.project_id, credentials });
    const [exists] = await storage.bucket(env.GCS_BUCKET_NAME || 'brainstudio-unstructured-v2').exists();
    return exists;
  } },
  { id: 'discovery_engine', name: 'Discovery Engine', configured: hasGoogleCredentials(env), check: async () => {
    const [{ JWT }, { default: credentials }] = await Promise.all([
      import('google-auth-library'),
      import('../lib/googleCredentials.js')
    ]);
    const auth = new JWT({ email: credentials.client_email, key: credentials.private_key, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const token = await auth.authorize();
    const project = credentials.project_id || env.GOOGLE_CLOUD_PROJECT;
    const location = env.DISCOVERY_ENGINE_LOCATION || 'global';
    const engine = env.ENGINE_ID || env.DISCOVERY_ENGINE_ENGINE_ID || 'brainstudio-intelligence-v_1769659564733';
    const url = `https://discoveryengine.googleapis.com/v1/projects/${project}/locations/${location}/collections/default_collection/engines/${engine}/servingConfigs/default_search:search`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'healthcheck', pageSize: 1 })
    });
    return response.ok;
  } },
  { id: 'fireflies', name: 'Fireflies', configured: Boolean(env.FIREFLIES_API_KEY), check: async () => {
    const response = await fetch('https://api.fireflies.ai/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.FIREFLIES_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'query ServiceStatus { user { user_id } }' })
    });
    if (!response.ok) return false;
    const body = await response.json();
    return !body.errors;
  } },
  { id: 's3_storage', name: 'Almacenamiento S3', configured: Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY), check: async () => {
    const { S3Client, HeadBucketCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      endpoint: env.AWS_ENDPOINT_URL || 'https://t3.storageapi.dev',
      region: 'us-east-1',
      credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
      forcePathStyle: true
    });
    await client.send(new HeadBucketCommand({ Bucket: env.AWS_S3_BUCKET_NAME || 'chat-evidence' }));
    return true;
  } },
  { id: 'email', name: 'Correo SMTP', configured: Boolean((env.SMTP_USER || env.GMAIL_SMTP_USER) && (env.SMTP_PASS || env.GMAIL_SMTP_PASS)), check: async () => {
    const { default: nodemailer } = await import('nodemailer');
    const port = Number(env.SMTP_PORT || 465);
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: { user: env.SMTP_USER || env.GMAIL_SMTP_USER, pass: env.SMTP_PASS || env.GMAIL_SMTP_PASS }
    });
    return transporter.verify();
  } },
  {
    id: 'push_notifications',
    name: 'Notificaciones push',
    configured: Boolean(env.WEB_PUSH_PUBLIC_KEY && env.WEB_PUSH_PRIVATE_KEY && env.WEB_PUSH_SUBJECT),
    check: async () => true
  }
];

export const clearServiceStatusCache = () => {
  cachedResult = null;
  cachedAt = 0;
};

export const collectServiceStatuses = async ({
  probes = createDefaultServiceProbes(),
  timeoutMs = 5000,
  cacheMs = 60000,
  now = () => Date.now()
} = {}) => {
  const currentTime = now();
  if (cacheMs > 0 && cachedResult && currentTime - cachedAt < cacheMs) return cachedResult;

  const checkedAt = new Date(currentTime).toISOString();
  const result = await Promise.all(probes.map(async (probe) => {
    if (probe.configured === false) return { id: probe.id, name: probe.name, status: 'not_configured', checkedAt };
    try {
      const healthy = await withTimeout(probe.check(), timeoutMs);
      return { id: probe.id, name: probe.name, status: healthy ? 'operational' : 'unavailable', checkedAt };
    } catch (error) {
      console.error(`[ServiceStatus] ${probe.id} check failed:`, error.message);
      return { id: probe.id, name: probe.name, status: 'unavailable', checkedAt };
    }
  }));

  cachedResult = result;
  cachedAt = currentTime;
  return result;
};
