import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const SHARED_TEST_DATABASE_URL = 'postgresql://shared_tasks_test@127.0.0.1:55451/shared_tasks_demo';
export const sharedTaskRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const sharedTaskOutput = path.join(sharedTaskRoot, 'output/shared-tasks-local');
const cluster = path.join(sharedTaskRoot, 'output/shared-tasks-pg-data');
const pgBin = path.join(sharedTaskRoot, 'output/quotation-pg-runtime/node_modules/@embedded-postgres/windows-x64/native/bin');

export function assertSharedTaskDatabase(value) {
  if (value !== SHARED_TEST_DATABASE_URL) throw new Error('Solo se permite el clúster aislado de tareas compartidas.');
  return true;
}

export function sharedTaskEnvironment(source = process.env) {
  const env = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA']) {
    if (source[key] !== undefined) env[key] = source[key];
  }
  Object.assign(env, {
    NODE_ENV: 'test', DATABASE_URL: SHARED_TEST_DATABASE_URL, TEST_DATABASE_URL: SHARED_TEST_DATABASE_URL,
    JWT_SECRET: randomBytes(32).toString('hex'), ENCRYPTION_KEY: randomBytes(16).toString('hex'),
    MFA_REQUIRED_ROLES: '', DEMO_MODE: 'true', DOTENV_CONFIG_PATH: path.join(sharedTaskOutput, 'environment-disabled'),
    OPENAI_API_KEY: '', SMTP_PASS: '', SMTP_HOST: '', SMTP_USER: '', AWS_SECRET_ACCESS_KEY: '', AWS_ACCESS_KEY_ID: '',
    META_WHATSAPP_TOKEN: '', META_SYSTEM_USER_TOKEN: '', FIREFLIES_API_KEY: '', WEB_PUSH_PRIVATE_KEY: '', WEB_PUSH_PUBLIC_KEY: '',
    GOOGLE_APPLICATION_CREDENTIALS_JSON: '', DATABASE_PUBLIC_URL: '', PORT: '8091', PRISMA_GENERATE_SKIP_AUTOINSTALL: 'true',
  });
  return env;
}

export function runSharedCommand(command, args, { env = sharedTaskEnvironment(), cwd = sharedTaskOutput, allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', value => { output += value; });
    child.stderr.on('data', value => { output += value; });
    child.once('error', reject);
    child.once('exit', code => code === 0 || allowFailure ? resolve({ code, output }) : reject(new Error(`${path.basename(command)} terminó con ${code}: ${output}`)));
  });
}

export async function prepareSharedTaskDatabase() {
  assertSharedTaskDatabase(SHARED_TEST_DATABASE_URL);
  await mkdir(sharedTaskOutput, { recursive: true });
  await writeFile(path.join(sharedTaskOutput, 'environment-disabled'), '');
  const initdb = path.join(pgBin, 'initdb.exe');
  const pgctl = path.join(pgBin, 'pg_ctl.exe');
  if (!existsSync(initdb) || !existsSync(pgctl)) throw new Error('Faltan los binarios PostgreSQL locales ya usados por las pruebas; no se descarga nada.');
  if (!existsSync(path.join(cluster, 'PG_VERSION'))) {
    await mkdir(cluster, { recursive: true });
    await runSharedCommand(initdb, ['-D', cluster, '-U', 'shared_tasks_test', '-A', 'trust', '--encoding=UTF8', '--locale=C']);
  }
  const status = await runSharedCommand(pgctl, ['-D', cluster, 'status'], { allowFailure: true });
  if (status.code !== 0) await runSharedCommand(pgctl, ['-D', cluster, '-o', '-h 127.0.0.1 -p 55451', '-l', path.join(sharedTaskOutput, 'postgres.log'), 'start']);
  const admin = new pg.Client({ connectionString: 'postgresql://shared_tasks_test@127.0.0.1:55451/postgres' });
  await admin.connect();
  try {
    const identity = (await admin.query('SELECT current_user AS username, host(inet_server_addr()) AS host, inet_server_port() AS port')).rows[0];
    if (identity.username !== 'shared_tasks_test' || identity.host !== '127.0.0.1' || identity.port !== 55451) throw new Error('No coincide la identidad del clúster aislado.');
    if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname = 'shared_tasks_demo'")).rowCount) await admin.query('CREATE DATABASE shared_tasks_demo');
  } finally { await admin.end(); }
  // Fuera del repositorio y con package.json propio: Prisma no descubre el .env del proyecto.
  const cliDirectory = path.join(os.tmpdir(), 'intelligence-shared-tasks-schema');
  await mkdir(cliDirectory, { recursive: true });
  await writeFile(path.join(cliDirectory, 'package.json'), '{"private":true,"type":"module"}');
  const schema = path.join(cliDirectory, 'schema.prisma');
  const source = await readFile(path.join(sharedTaskRoot, 'prisma/schema.prisma'), 'utf8');
  // Este PostgreSQL portable no trae pgvector. Solo se omiten embeddings ajenos al circuito probado.
  // Tareas, estados, participantes, sesiones, ciclos, permisos y reconocimientos conservan el esquema real.
  await writeFile(schema, source.replace(/^.*Unsupported\("vector\(\d+\)"\).*\r?\n/gm, ''));
  const inspect = new pg.Client({ connectionString: SHARED_TEST_DATABASE_URL });
  await inspect.connect();
  let empty = true;
  try {
    const tables = (await inspect.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")).rows;
    for (const { tablename } of tables) {
      const quoted = `"${tablename.replaceAll('"', '""')}"`;
      if ((await inspect.query(`SELECT EXISTS(SELECT 1 FROM public.${quoted} LIMIT 1) AS present`)).rows[0].present) { empty = false; break; }
    }
  } finally { await inspect.end(); }
  // Tras un bootstrap interrumpido pueden faltar índices. Solo una base COMPROBADA VACÍA acepta reconstrucción.
  const args = [path.join(sharedTaskRoot, 'node_modules/prisma/build/index.js'), 'db', 'push', '--schema', schema, '--skip-generate'];
  if (empty) args.push('--accept-data-loss');
  const prepared = await runSharedCommand(process.execPath, args, { cwd: cliDirectory });
  const sql = new pg.Client({ connectionString: SHARED_TEST_DATABASE_URL });
  await sql.connect();
  try {
    const identity = (await sql.query('SELECT current_database() AS database, current_user AS username, inet_server_port() AS port')).rows[0];
    if (identity.database !== 'shared_tasks_demo' || identity.username !== 'shared_tasks_test' || identity.port !== 55451) throw new Error('No coincide la base aislada.');
    return { ...identity, url: SHARED_TEST_DATABASE_URL, output: prepared.output };
  } finally { await sql.end(); }
}

export async function generateSharedTaskClient() {
  const directory = path.join(os.tmpdir(), 'intelligence-shared-tasks-schema');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'package.json'), '{"private":true,"type":"module"}');
  const source = await readFile(path.join(sharedTaskRoot, 'prisma/schema.prisma'), 'utf8');
  const output = path.join(sharedTaskRoot, 'node_modules/.prisma/client').replaceAll('\\', '/');
  const provider = path.join(sharedTaskRoot, 'node_modules/@prisma/client/generator-build/index.js').replaceAll('\\', '/');
  const schema = path.join(directory, 'schema-client.prisma');
  await writeFile(schema, source.replace('provider = "prisma-client-js"', `provider = "node ${provider}"\n  output = "${output}"`));
  return runSharedCommand(process.execPath, [path.join(sharedTaskRoot, 'node_modules/prisma/build/index.js'), 'generate', '--schema', schema], { cwd: directory });
}

export async function seedSharedTaskActors() {
  const { PrismaClient } = await import('@prisma/client');
  const bcrypt = (await import('bcryptjs')).default;
  const db = new PrismaClient({ datasources: { db: { url: SHARED_TEST_DATABASE_URL } } });
  const runId = randomUUID();
  const password = 'Local-compartidas-2026!';
  const hashed = await bcrypt.hash(password, 10);
  try {
    const actors = {};
    for (const [key, name, role] of [['ana', 'Ana · Prueba compartida', 'EDITOR'], ['bea', 'Bea · Prueba compartida', 'EDITOR'], ['carlos', 'Carlos · Prueba compartida', 'EDITOR'], ['manager', 'Dirección · Prueba compartida', 'ADMIN'], ['outside', 'Persona ajena · Prueba compartida', 'EDITOR']]) {
      const user = await db.user.create({ data: { name, role, email: `${key}-${runId}@example.invalid`, password: hashed,
        modulePermissions: { dashboard: true, gestion: true, parrillas: true, clientes: true }, notificationPreferences: { push: false } } });
      const member = await db.teamMember.create({ data: { name, role: 'Prueba local', email: user.email, userId: user.id } });
      actors[key] = { id: user.id, memberId: member.id, name, role, email: user.email, password };
    }
    const client = await db.client.create({ data: { name: `Cliente ficticio · Compartidas ${runId.slice(0, 8)}`, slug: `compartidas-${runId}`, status: 'ACTIVO' } });
    return { runId, actors, client };
  } finally { await db.$disconnect(); }
}

export async function startSharedTaskApi() {
  await mkdir(sharedTaskOutput, { recursive: true });
  await writeFile(path.join(sharedTaskOutput, 'environment-disabled'), '');
  const child = spawn(process.execPath, [path.join(sharedTaskRoot, 'scripts/shared-tasks-api-local.mjs')], {
    cwd: sharedTaskOutput, env: sharedTaskEnvironment(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`La API aislada no arrancó: ${output}`)), 30_000);
    child.stdout.on('data', value => { output += value; if (output.includes('SHARED_TASK_API_READY')) { clearTimeout(timeout); resolve(); } });
    child.stderr.on('data', value => { output += value; });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`La API terminó con ${code}: ${output}`)); });
  });
  try { await ready; } catch (error) { child.kill(); throw error; }
  return { origin: 'http://127.0.0.1:8091', logs: () => output, close: () => new Promise(resolve => { if (child.exitCode !== null) return resolve(); child.once('exit', resolve); child.kill(); }) };
}
