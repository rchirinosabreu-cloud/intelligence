// El medidor del health score de la plataforma (fase 0, Rodny, 14 de noviembre de 2026: «un plan y procedimiento
// para que ese Health Score nos dé 10 de 10 en todo»). La nota deja de ser una opinión: cada área tiene criterios
// que se cumplen o no, y lo que se puede leer del código se lee del código.
//
//   npm run health           el informe completo, con la nota de cada área y lo que falta
//   npm run health:check     lo corre CI: falla si algo empeoró frente a la línea base
//   npm run health:update    encoge la línea base cuando algo mejoró (nunca la agranda)
//
// Tres cosas se frenan desde hoy, comparando con scripts/health-score-baseline.json:
//   1. un archivo nuevo de más de LINE_LIMIT líneas;
//   2. un archivo nuevo con la marca escrita a mano («Brain Studio», «Francisco Villa», el dominio);
//   3. un archivo nuevo con la zona horaria escrita a mano («America/Bogota»).
// Lo que ya estaba queda anotado en la línea base y se va sacando por fases. Un archivo grande que sigue
// creciendo avisa pero no frena todavía. Lo que confirma una persona (una restauración probada, una revisión
// externa) se anota con su fecha en scripts/health-score-manual.json y vence. Detalle: docs/HEALTH_SCORE.md.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_FILE = path.join('scripts', 'health-score-baseline.json');
const MANUAL_FILE = path.join('scripts', 'health-score-manual.json');
const COVERAGE_FILE = path.join('scripts', 'health-score-coverage.json');
export const MANUAL_ENTRIES_FILE = MANUAL_FILE;
export const SNAPSHOT_FILE = 'health-score-snapshot.json';

export const LINE_LIMIT = 800;
export const AGENTS_CHAR_LIMIT = 40000;
export const COVERAGE_FLOOR = 80;

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs']);
const BRAND_TEXT = /Brain ?Studio|BRAIN ?STUDIO|Brainstudio|Francisco Villa|brainstudioagencia\.com/;
const FIXED_TIMEZONE = /America\/Bogota/;

/** Quita los comentarios: una regla escrita en un comentario no es texto que vea el cliente ni código que corra. */
export const stripComments = (source) => String(source)
  .replace(/(^|[\s{(;,])\/\*[\s\S]*?\*\//g, '$1')
  .replace(/(^|\s)\/\/.*$/gm, '$1');

export const scanSource = (source) => {
  const text = String(source);
  const lines = text.length ? text.replace(/\n$/, '').split('\n').length : 0;
  const code = stripComments(text);
  return { lines, brand: BRAND_TEXT.test(code), timezone: FIXED_TIMEZONE.test(code) };
};

const walk = (directory, found = []) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) found.push(full);
  }
  return found;
};

const readJson = (root, relative, fallback) => {
  try { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); } catch { return fallback; }
};
const readText = (root, relative) => {
  try { return fs.readFileSync(path.join(root, relative), 'utf8'); } catch { return ''; }
};

/** Lo que se lee del repositorio sin red ni base de datos. Vulnerabilidades y rutas las añade el informe completo. */
export const collectFacts = (root = ROOT) => {
  const files = [...walk(path.join(root, 'src')), path.join(root, 'server.js')].filter((file) => fs.existsSync(file));
  const oversized = {};
  const brand = [];
  const timezone = [];
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    const scan = scanSource(fs.readFileSync(file, 'utf8'));
    if (scan.lines > LINE_LIMIT) oversized[relative] = scan.lines;
    if (scan.brand) brand.push(relative);
    if (scan.timezone) timezone.push(relative);
  }
  const has = (relative) => fs.existsSync(path.join(root, ...relative.split('/')));
  const scripts = readJson(root, 'package.json', {}).scripts || {};
  const startup = `${scripts.prestart || ''} ${scripts.start || ''}`;
  const ci = readText(root, path.join('.github', 'workflows', 'ci.yml'));
  const exceptions = readJson(root, path.join('scripts', 'security-audit-exceptions.json'), {});
  const coverage = readJson(root, COVERAGE_FILE, null);
  return {
    files: files.length,
    oversized: Object.fromEntries(Object.entries(oversized).sort(([a], [b]) => a.localeCompare(b))),
    brand: brand.sort(),
    timezone: timezone.sort(),
    agentsChars: readText(root, 'AGENTS.md').length,
    ensureScripts: (startup.match(/ensure-[\w-]+\.js/g) || []).length,
    migrationsOnStart: /prisma migrate deploy/.test(startup),
    healthcheck: /healthcheckPath/.test(readText(root, 'railway.json') + readText(root, 'railway.toml')),
    testsInCi: /npm run test:ci/.test(ci),
    browserTestsInCi: /tests\/browser/.test(ci),
    coverage: Number.isFinite(coverage?.porcentaje) ? coverage.porcentaje : null,
    permissionMatrix: fs.existsSync(path.join(root, 'docs', 'MATRIZ_DE_PERMISOS.md')),
    moduleList: fs.existsSync(path.join(root, 'src', 'lib', 'platformModules.js')) && fs.existsSync(path.join(root, 'tests', 'platformModules.test.js')),
    demoSeed: fs.existsSync(path.join(root, 'scripts', 'seed-demo.js')),
    platformMap: fs.existsSync(path.join(root, 'tests', 'platformCatalog.test.js')),
    securityExceptions: Object.keys(exceptions).filter((key) => !key.startsWith('$')).length,
    // Lo que la plataforma ya tiene: se da por presente si su pieza está en el código (y en el arranque o en CI si aplica).
    present: {
      mfa: has('src/lib/totp.js') && has('tests/totp.test.js'),
      vault: has('src/lib/vaultCrypto.js'),
      auditImmutable: /ensure-audit-immutability/.test(startup),
      rateLimit: has('src/lib/authRateLimit.js'),
      aiLog: has('src/services/aiEgress.js'),
      taskPrivacy: has('src/middlewares/taskPrivacyMiddleware.js'),
      serviceHealth: has('src/lib/serviceHealth.js'),
      clientErrors: has('src/lib/appErrors.js'),
      demoInstance: has('src/lib/demoMode.js'),
      legalEntity: has('src/components/public/legalEntity.js'),
      welcome: has('src/lib/welcomeContent.js'),
      browserTests: fs.existsSync(path.join(root, 'tests', 'browser')) && fs.readdirSync(path.join(root, 'tests', 'browser')).some((name) => name.endsWith('.mjs'))
    },
    ci: {
      audit: /npm run audit:security/.test(ci),
      licenses: /npm run licenses:check/.test(ci),
      lint: /npm run lint/.test(ci),
      deadCode: /npm run audit:dead-code/.test(ci),
      build: /npm run build/.test(ci),
      postgres: /postgres:/.test(ci)
    },
    vulnerabilities: null,
    routes: null
  };
};

/** Qué empeoró (frena), qué creció (avisa) y qué mejoró frente a la línea base guardada. */
export const compareToBaseline = (current, baseline) => {
  const failures = [];
  const warnings = [];
  const improvements = [];
  const known = baseline.oversized || {};
  for (const [file, lines] of Object.entries(current.oversized || {})) {
    if (!(file in known)) failures.push(`${file} tiene ${lines} líneas: un archivo nuevo no pasa de ${LINE_LIMIT}. Pártelo en piezas más pequeñas.`);
    else if (lines > known[file]) warnings.push(`${file} creció de ${known[file]} a ${lines} líneas: está en la lista de archivos por partir.`);
  }
  for (const file of current.brand || []) {
    if (!(baseline.brand || []).includes(file)) failures.push(`${file} escribe la marca a mano («Brain Studio», «Francisco Villa» o el dominio): tómala de la configuración de la empresa.`);
  }
  for (const file of current.timezone || []) {
    if (!(baseline.timezone || []).includes(file)) failures.push(`${file} escribe la zona horaria a mano («America/Bogota»): usa las funciones de fecha compartidas.`);
  }
  const smaller = Object.entries(known).filter(([file, lines]) => !(file in (current.oversized || {})) || current.oversized[file] < lines).length;
  if (smaller) improvements.push(`${smaller} archivo(s) grande(s) se redujeron o ya caben en ${LINE_LIMIT} líneas.`);
  const unbranded = (baseline.brand || []).filter((file) => !(current.brand || []).includes(file)).length;
  if (unbranded) improvements.push(`${unbranded} archivo(s) ya no escriben la marca a mano.`);
  const untimed = (baseline.timezone || []).filter((file) => !(current.timezone || []).includes(file)).length;
  if (untimed) improvements.push(`${untimed} archivo(s) ya no escriben la zona horaria a mano.`);
  return { failures, warnings, improvements };
};

/** La línea base nueva: lo que salió, sale, y lo que bajó, baja. Nada nuevo entra por aquí. */
export const shrinkBaseline = (current, baseline) => ({
  oversized: Object.fromEntries(Object.entries(baseline.oversized || {})
    .filter(([file]) => file in (current.oversized || {}))
    .map(([file, lines]) => [file, Math.min(lines, current.oversized[file])])),
  brand: (baseline.brand || []).filter((file) => (current.brand || []).includes(file)),
  timezone: (baseline.timezone || []).filter((file) => (current.timezone || []).includes(file))
});

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (day, days) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

/** Un criterio que solo puede confirmar una persona: vale desde su fecha y, si tiene vigencia, hasta que vence. */
export const manualCriterionState = (rule, entry, today) => {
  if (!entry) return { met: false, detail: 'Todavía no se ha confirmado.' };
  if (!ISO_DAY.test(String(entry.fecha || '')) || Number.isNaN(Date.parse(`${entry.fecha}T00:00:00Z`))) {
    return { met: false, detail: 'La fecha anotada no se entiende (AAAA-MM-DD).' };
  }
  if (rule.validDays) {
    const until = addDays(entry.fecha, rule.validDays);
    if (until < today) return { met: false, detail: `Se confirmó el ${entry.fecha} y venció el ${until}: hay que repetirlo.` };
    return { met: true, detail: `Confirmado el ${entry.fecha}; vale hasta el ${until}.` };
  }
  return { met: true, detail: `Confirmado el ${entry.fecha}.` };
};

const auto = (id, label, check) => ({ id, label, kind: 'auto', check });
const manual = (id, label, validDays) => ({ id, label, kind: 'manual', validDays });
const count = (value) => (Array.isArray(value) ? value.length : Object.keys(value || {}).length);
const yes = (met, pending, done = 'Cumplido.') => ({ met: Boolean(met), detail: met ? done : pending });

// Una pieza que la plataforma ya tiene: cuenta mientras siga en el código, en el arranque o en la revisión automática.
const piece = (id, label, read) => auto(id, label, (f) => yes(read(f), 'Ya no está: la pieza que lo daba se quitó del código o de la revisión automática.'));

export const AREAS = [
  { id: 'producto', name: 'Producto', criteria: [
    auto('demo-con-datos-ficticios', 'Hay una demo que se siembra con datos inventados', (f) => yes(f.demoSeed, 'Falta la semilla de la demo.')),
    auto('mapa-completo', 'Cada ruta de la plataforma está descrita en el mapa', (f) => yes(f.platformMap, 'Falta la prueba del mapa de la plataforma.')),
    piece('lista-de-modulos', 'Los módulos salen de una sola lista', (f) => f.moduleList),
    piece('bienvenida-por-modulo', 'Cada módulo tiene su bienvenida para quien entra por primera vez', (f) => f.present?.welcome),
    manual('guia-de-uso', 'Guía de uso por módulo para un equipo nuevo'),
    manual('instalacion-en-un-dia', 'Una agencia nueva quedó funcionando en un día sin tocar código', 365)
  ] },
  { id: 'pruebas', name: 'Pruebas', criteria: [
    auto('suite-en-cada-cambio', 'Las pruebas corren solas en cada cambio', (f) => yes(f.testsInCi, 'La revisión automática no corre las pruebas.')),
    piece('base-real-en-cada-cambio', 'Las pruebas de datos corren contra una base de datos real', (f) => f.ci?.postgres),
    piece('recorridos-de-navegador', 'Hay recorridos reales en navegador de las pantallas', (f) => f.present?.browserTests),
    auto('recorridos-en-cada-cambio', 'Los recorridos clave en navegador corren solos en cada cambio', (f) => yes(f.browserTestsInCi, 'Los recorridos de navegador solo se corren a mano.')),
    auto('cobertura-minima', `Las pruebas cubren al menos el ${COVERAGE_FLOOR} % del código`, (f) => (f.coverage == null
      ? { met: false, detail: 'Sin medir: todavía no se calcula la cobertura.' }
      : yes(f.coverage >= COVERAGE_FLOOR, `La cobertura es del ${f.coverage} %.`, `Cobertura del ${f.coverage} %.`)))
  ] },
  { id: 'permisos', name: 'Permisos', criteria: [
    auto('lista-unica-de-modulos', 'Una sola lista de módulos decide quién entra a qué', (f) => yes(f.moduleList, 'Falta la lista única de módulos o su prueba.')),
    piece('permisos-leidos-del-codigo', 'Los permisos de cada ruta se leen del código que corre', (f) => f.platformMap),
    piece('privado-en-el-servidor', 'Lo privado se cierra en el servidor, no solo en la pantalla', (f) => f.present?.taskPrivacy),
    auto('guardian-por-ruta', 'Cada ruta declara quién puede usarla', (f) => (f.routes == null
      ? { met: false, detail: 'Sin medir: no se pudieron leer las rutas.' }
      : yes(f.routes.unguarded === 0, `${f.routes.unguarded} de ${f.routes.total} rutas solo piden haber iniciado sesión: falta declarar cuáles son de todo el equipo.`))),
    auto('matriz-de-permisos', 'Matriz de permisos documentada', (f) => yes(f.permissionMatrix, 'Falta el documento de la matriz de permisos.')),
    manual('prueba-de-permiso-por-ruta', 'Cada ruta tiene una prueba que demuestra que sin permiso responde «no»')
  ] },
  { id: 'seguridad', name: 'Seguridad', criteria: [
    piece('verificacion-en-dos-pasos', 'Verificación en dos pasos con app autenticadora', (f) => f.present?.mfa),
    piece('accesos-cifrados', 'Las contraseñas de la bóveda se guardan cifradas', (f) => f.present?.vault),
    piece('auditoria-inmutable', 'Los registros de auditoría no se pueden editar ni borrar', (f) => f.present?.auditImmutable),
    piece('limite-de-intentos', 'Límite de intentos de ingreso por persona', (f) => f.present?.rateLimit),
    piece('registro-de-ia', 'Todo uso de IA queda registrado', (f) => f.present?.aiLog),
    piece('puerta-de-vulnerabilidades', 'Cada cambio pasa por la revisión de vulnerabilidades y licencias', (f) => f.ci?.audit && f.ci?.licenses),
    auto('sin-vulnerabilidades-altas', 'Cero vulnerabilidades altas o críticas en producción', (f) => (f.vulnerabilities == null
      ? { met: false, detail: 'Sin medir: no se pudo consultar npm audit.' }
      : yes(f.vulnerabilities.high + f.vulnerabilities.critical === 0, `${f.vulnerabilities.critical} críticas y ${f.vulnerabilities.high} altas (paquetes afectados).`))),
    auto('sin-excepciones', 'Ninguna vulnerabilidad aceptada «por ahora»', (f) => yes(f.securityExceptions === 0, `${f.securityExceptions} vulnerabilidad(es) aceptada(s) por ahora, con fecha de revisión.`)),
    manual('revision-externa', 'Revisión de seguridad externa sin hallazgos graves', 365),
    manual('restauracion-probada', 'La copia de la base se restauró con éxito', 90)
  ] },
  { id: 'codigo', name: 'Organización del código', criteria: [
    piece('estilo-en-cada-cambio', 'Cada cambio pasa la revisión de estilo y compila', (f) => f.ci?.lint && f.ci?.build),
    piece('sin-codigo-muerto', 'Cada cambio pasa la revisión de código sin uso', (f) => f.ci?.deadCode),
    auto('sin-archivos-gigantes', `Ningún archivo pasa de ${LINE_LIMIT} líneas`, (f) => yes(count(f.oversized) === 0, `${count(f.oversized)} archivos pasan de ${LINE_LIMIT} líneas.`)),
    auto('reglas-en-indice-corto', 'Las reglas del proyecto son un índice corto con un documento por módulo', (f) => yes(f.agentsChars <= AGENTS_CHAR_LIMIT, `Las reglas del proyecto tienen ${f.agentsChars.toLocaleString('es-CO')} caracteres (meta: ${AGENTS_CHAR_LIMIT.toLocaleString('es-CO')}).`)),
    auto('migraciones-con-version', 'Los cambios de la base van en migraciones con versión', (f) => yes(f.migrationsOnStart, 'El arranque no aplica migraciones con versión.')),
    auto('sin-scripts-de-arranque', 'Ningún script arregla la base al arrancar', (f) => yes(f.ensureScripts === 0, `${f.ensureScripts} scripts corren en cada arranque para ajustar la base.`))
  ] },
  { id: 'operacion', name: 'Operación', criteria: [
    piece('semaforo-de-servicios', 'Un semáforo vigila cada servicio externo y avisa si se cae', (f) => f.present?.serviceHealth),
    piece('errores-de-pantalla-registrados', 'Cada error de pantalla queda registrado con su referencia', (f) => f.present?.clientErrors),
    auto('chequeo-de-salud', 'El despliegue tiene chequeo de salud declarado', (f) => yes(f.healthcheck, 'Falta declarar el chequeo de salud del despliegue.')),
    manual('despliegue-automatico', 'El despliegue sale solo al fusionar, sin pasos a mano'),
    manual('vigilante-externo', 'Un vigilante externo avisa si la plataforma se cae'),
    manual('procesos-separados', 'Los procesos automáticos corren aparte del servidor que atiende a la gente'),
    manual('dos-servidores', 'Dos servidores atienden a la gente y se despliega sin caída'),
    manual('entorno-de-pruebas', 'Hay un entorno de pruebas aparte de producción')
  ] },
  { id: 'otro-cliente', name: 'Lista para otro cliente', criteria: [
    piece('instalacion-aparte', 'El mismo código corre en una instalación aparte con otros datos (la demo)', (f) => f.present?.demoInstance),
    piece('datos-legales-en-un-sitio', 'Los datos legales de la empresa viven en un solo archivo', (f) => f.present?.legalEntity),
    auto('sin-marca-fija', 'Ningún archivo escribe la marca a mano', (f) => yes(count(f.brand) === 0, `${count(f.brand)} archivos escriben «Brain Studio», «Francisco Villa» o el dominio.`)),
    auto('sin-zona-horaria-fija', 'Ningún archivo escribe la zona horaria a mano', (f) => yes(count(f.timezone) === 0, `${count(f.timezone)} archivos escriben la hora de Bogotá a mano.`)),
    manual('plantilla-cliente-nuevo', 'Una plantilla crea el entorno completo de un cliente nuevo'),
    manual('segunda-instancia-sin-codigo', 'Una segunda instancia funciona sin cambiar código', 365)
  ] }
];

/** La nota de cada área: criterios cumplidos sobre el total, de 0 a 10. Lo que no se pudo medir no cuenta como cumplido. */
export const evaluateAreas = (facts, manualEntries = {}, today) => AREAS.map((area) => {
  const criteria = area.criteria.map((rule) => {
    const state = rule.kind === 'manual' ? manualCriterionState(rule, manualEntries[rule.id], today) : rule.check(facts);
    return { id: rule.id, label: rule.label, kind: rule.kind, met: state.met, detail: state.detail };
  });
  const met = criteria.filter((criterion) => criterion.met).length;
  return { id: area.id, name: area.name, criteria, met, total: criteria.length, score: Math.round((met / criteria.length) * 100) / 10 };
});

/** El promedio de las áreas, con un decimal: la cifra que encabeza el informe y la tarjeta de Salud operativa. */
export const averageScore = (areas) => (areas.length ? Math.round((areas.reduce((sum, area) => sum + area.score, 0) / areas.length) * 10) / 10 : 0);

const bogotaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

const readVulnerabilities = () => {
  let output;
  try {
    output = execSync('npm audit --omit=dev --json', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (error) {
    // npm audit sale con código 1 cuando encuentra vulnerabilidades: el JSON sigue en stdout.
    output = error.stdout;
  }
  try {
    const counts = JSON.parse(output).metadata?.vulnerabilities;
    return counts ? { high: counts.high || 0, critical: counts.critical || 0 } : null;
  } catch { return null; }
};

const readRoutes = async () => {
  try {
    process.env.JWT_SECRET ||= 'clave-local-del-medidor-de-32-caracteres-o-mas';
    const [{ listApiRoutes }, { describeGuards }, { default: apiRouter }] = await Promise.all([
      import('../src/lib/platformRoutes.js'), import('../src/lib/platformCatalog.js'), import('../src/routes/index.js')
    ]);
    const routes = listApiRoutes(apiRouter);
    return { total: routes.length, unguarded: routes.filter((route) => !describeGuards(route.guards)).length };
  } catch { return null; }
};

const printReport = (areas, facts) => {
  console.log(`Health score de la plataforma: ${averageScore(areas)} de 10 (promedio de ${areas.length} áreas, ${facts.files} archivos leídos)\n`);
  for (const area of areas) {
    console.log(`${area.name}: ${area.score} de 10 (${area.met} de ${area.total} criterios)`);
    for (const criterion of area.criteria) {
      console.log(`  ${criterion.met ? '[x]' : '[ ]'} ${criterion.label}${criterion.kind === 'manual' ? ' (lo confirma una persona)' : ''}`);
      if (!criterion.met) console.log(`      ${criterion.detail}`);
    }
    console.log('');
  }
};

const main = async () => {
  const args = new Set(process.argv.slice(2));
  const facts = collectFacts(ROOT);
  const baselinePath = path.join(ROOT, BASELINE_FILE);
  const baseline = readJson(ROOT, BASELINE_FILE, null);

  if (args.has('--update')) {
    const next = baseline ? shrinkBaseline(facts, baseline) : { oversized: facts.oversized, brand: facts.brand, timezone: facts.timezone };
    const comment = baseline?.$comentario || 'Lo que ya existía cuando se creó el medidor (14 de noviembre de 2026). Lo lee scripts/health-score.mjs: un archivo que no esté aquí no puede pasar del límite de líneas, ni escribir la marca o la zona horaria a mano. Solo se encoge, con npm run health:update; nunca se le añade a mano para que un cambio pase.';
    fs.writeFileSync(baselinePath, `${JSON.stringify({ $comentario: comment, ...next }, null, 2)}\n`);
    console.log(`Línea base guardada: ${count(next.oversized)} archivos grandes, ${next.brand.length} con la marca y ${next.timezone.length} con la zona horaria.`);
    return;
  }

  // La medición que viaja con la versión publicada (la escribe el Dockerfile): Salud operativa la lee tal cual,
  // con las vulnerabilidades consultadas al construir. Las rutas las añade el servidor que está corriendo.
  if (args.has('--snapshot')) {
    facts.vulnerabilities = readVulnerabilities();
    fs.writeFileSync(path.join(ROOT, SNAPSHOT_FILE), `${JSON.stringify({ generatedAt: new Date().toISOString(), facts })}\n`);
    console.log(`Medición guardada en ${SNAPSHOT_FILE}.`);
    return;
  }

  if (args.has('--check')) {
    if (!baseline) { console.error(`Falta ${BASELINE_FILE}.`); process.exitCode = 1; return; }
    const { failures, warnings, improvements } = compareToBaseline(facts, baseline);
    for (const warning of warnings) console.log(`::warning::${warning}`);
    for (const improvement of improvements) console.log(`::notice::${improvement} Corre npm run health:update para anotarlo.`);
    if (failures.length) {
      console.error(`El health score empeoró en ${failures.length} punto(s):`);
      for (const failure of failures) console.error(`  - ${failure}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Health score: nada empeoró (${count(facts.oversized)} archivos grandes, ${facts.brand.length} con la marca, ${facts.timezone.length} con la zona horaria).`);
    return;
  }

  if (!args.has('--rapido')) {
    facts.vulnerabilities = readVulnerabilities();
    facts.routes = await readRoutes();
  }
  const areas = evaluateAreas(facts, readJson(ROOT, MANUAL_FILE, {}), bogotaToday());
  if (args.has('--json')) console.log(JSON.stringify({ areas, facts }, null, 2));
  else printReport(areas, facts);
};

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  // Leer las rutas carga la aplicación entera, con sus relojes: se sale a propósito al terminar.
  main().then(() => process.exit(process.exitCode || 0), (error) => { console.error(error); process.exit(1); });
}
