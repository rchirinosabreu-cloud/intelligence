// Carga única del Excel «PENDIENTES BRAIN STUDIO 2026» a la Operación de clientes (2 de octubre de 2026).
// Rodny: «lo que ESTÁ EN LA PLATAFORMA es la fuente de verdad». Reglas de esta carga:
//  - El Excel solo llena huecos: un dato que la plataforma ya tiene no se pisa; si no coincide, se informa.
//  - Nada se adivina: un texto que no se entiende con seguridad queda en la nota del contrato y en las dudas.
//  - No se crean clientes: lo que no existe en la plataforma se lista, no se inventa.
// Solo lógica pura; el script `scripts/import-client-operations-excel.js` lee el archivo y la base.
import { CONTRACT_FORMATS, normalizeOperationProfile } from './clientOperations.js';

// «septimbre» está tal cual en el Excel (Wine & Wonder); se acepta para no perder la fecha.
const MONTHS = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, septimbre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const MONTH_RE = Object.keys(MONTHS).join('|');
const TYPO_FIXES = [[/\bcoporacion\b/g, 'corporacion'], [/\btitantes\b/g, 'titanes'], [/\bhabitat\b/g, 'abitat']];

const plain = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const pad = (n) => String(n).padStart(2, '0');

/** Nombre comparable: sin tildes, sin signos y con los errores de escritura conocidos del Excel corregidos. */
export function normalizeName(value) {
  let text = plain(value).replace(/[^a-z0-9]+/g, ' ').trim();
  for (const [pattern, fix] of TYPO_FIXES) text = text.replace(pattern, fix);
  // Sin espacios: «Brainstudio» y «Brain Studio» son el mismo cliente.
  return text.replace(/\s+/g, '');
}

const FORMAT_OF = [
  [/^(videos?\s*\/?\s*reels?|video\s*reels?|videos?|reels?)$/, 'Reel'],
  [/^(carrusel(es)?|carretes?)$/, 'Carrusel'],
  [/^(piezas?(\s+graficas?)?|estaticos?|posts?|publicaciones de fotografias)$/, 'Post'],
];

/**
 * «12 Contenidos: 2 videos. 2 carruseles, y 8 estaticos» → piezas por formato. Si el desglose no suma el
 * total, o solo hay total, no se adivina: `deliverables` queda vacío y `doubt` dice por qué.
 */
export function parseDeliverables(text) {
  const t = plain(text).replace(/[/]/g, ' / ').replace(/\s+/g, ' ');
  const totalMatch = t.match(/(\d+)\)?\s*(?:contenidos|publicaciones(?!\s+de\s+fotograf))/);
  const total = totalMatch ? Number(totalMatch[1]) : 0;
  const counts = new Map();
  const pattern = /(\d+)\)?\s*(videos?\s*\/\s*reels?|video\s*reels?|videos?|reels?|carrusel(?:es)?|carretes?|piezas?(?:\s+graficas?)?|estaticos?|posts?|publicaciones de fotografias)/g;
  for (const match of t.matchAll(pattern)) {
    const kind = match[2].replace(/\s+/g, ' ');
    const format = FORMAT_OF.find(([re]) => re.test(kind))?.[1];
    if (format) counts.set(format, (counts.get(format) || 0) + Number(match[1]));
  }
  const sum = [...counts.values()].reduce((a, b) => a + b, 0);
  const doubts = [];
  if (/carretes?/.test(t) && sum) doubts.push('«carretes» se leyó como carrusel; confirmar si eran reels');
  let deliverables = CONTRACT_FORMATS.filter((f) => counts.get(f)).map((format) => ({ format, quantity: counts.get(format) }));
  if (total && sum && sum !== total) {
    doubts.push(`los formatos suman ${sum} y el total dice ${total}`);
    deliverables = [];
  } else if (total && !sum) {
    doubts.push(`dice ${total} contenidos sin desglose por formato`);
  }
  return { deliverables, total: total || sum, doubt: doubts.join('; ') || null };
}

/** Historias por semana: «2 historias semanales», «Historias 3 días a la semana», «Todos los dias». */
export function parseStories(text) {
  const t = plain(text).replace(/[/]/g, ' ').replace(/\s+/g, ' ');
  if (/historias?[^.]*todos los dias|todos los dias[^.]*historias?/.test(t)) return 7;
  const direct = t.match(/(\d+)\)?\s*historias?\s*(?:semanal(?:es)?|por semana|a la semana)/);
  if (direct) return Math.min(7, Number(direct[1]));
  const days = t.match(/historias?\s*(\d+)\s*dias?\s*a\s*la\s*semana/);
  if (days) return Math.min(7, Number(days[1]));
  return 0;
}

/** Jornadas de producción al mes: «2 jornadas…»; si solo la columna dice «Jornada de producción», una. */
export function parseProductionDays(text, productionColumn = '') {
  const match = plain(text).match(/(\d+)\)?\s*jornadas?/);
  if (match) return Number(match[1]);
  return /jornada/.test(plain(productionColumn)) ? 1 : 0;
}

/** «20 de julio al 19 de enero» → fechas; el fin sin año va al año siguiente si su mes es anterior. */
export function parseVigencia(text, { year }) {
  const t = plain(text);
  const found = [...t.matchAll(new RegExp(`(\\d{1,2})\\s*(?:de\\s+)?(${MONTH_RE})(?:\\s*(?:de|del)?\\s*(\\d{4}))?`, 'g'))];
  if (found.length < 2) return null;
  const [a, b] = found;
  const startYear = Number(a[3]) || year;
  const startMonth = MONTHS[a[2]];
  const endMonth = MONTHS[b[2]];
  const endYear = Number(b[3]) || (endMonth < startMonth ? startYear + 1 : startYear);
  return { startDate: `${startYear}-${pad(startMonth)}-${pad(Number(a[1]))}`, endDate: `${endYear}-${pad(endMonth)}-${pad(Number(b[1]))}` };
}

/** Solo enlaces de Instagram, sin los parámetros de rastreo; «(@cuenta) • Instagram» también vale. */
export function cleanInstagram(text) {
  const value = String(text || '');
  const url = value.match(/instagram\.com\/([A-Za-z0-9._]+)/);
  if (url) return `https://www.instagram.com/${url[1]}/`;
  const handle = /instagram/i.test(value) && value.match(/@([A-Za-z0-9._]+)/);
  return handle ? `https://www.instagram.com/${handle[1]}/` : null;
}

function headerIndex(rows, label) {
  return rows.findIndex((row) => row.some((cell) => plain(cell).trim() === plain(label)));
}

function column(header, ...names) {
  const wanted = names.map((n) => plain(n).trim());
  return header.findIndex((cell) => wanted.includes(plain(cell).trim()));
}

const SKIP_NAMES = new Set(['colaborador', 'accion destacada', 'clientes a cargo', 'clientes', 'informes de mio kpis semana 12']);

const COMPLEXITY = { alta: 'ALTA', media: 'MEDIA', baja: 'BAJA' };

/**
 * Lee las hojas «INDICADORES 2026» y «MIO - BRAIN STUDIO» (filas como arreglos) y devuelve un registro
 * por cliente. Las filas repetidas se unen y se avisa; la hoja MIO, que es la más reciente, manda en
 * responsable, agencia y complejidad.
 */
export function readExcelClients({ indicadores, mio, year }) {
  const doubts = [];
  const byName = new Map();

  const hi = headerIndex(indicadores, 'CLIENTES');
  if (hi >= 0) {
    const h = indicadores[hi];
    const col = {
      name: column(h, 'CLIENTES'), def: column(h, 'Definición'), dates: column(h, 'Fecha inicio / terminación'), ig: column(h, 'Link y cuenta Instagram'),
      content: column(h, 'CONTENIDOS'), production: column(h, 'Producción'), pm: column(h, 'PROJECT MANAGER'), cm: column(h, 'CM'),
      report: column(h, 'Informe MES'), status: column(h, 'Estado'),
    };
    for (const row of indicadores.slice(hi + 1)) {
      const name = clean(row[col.name]);
      if (!name || SKIP_NAMES.has(normalizeName(name))) continue;
      const record = {
        name, description: clean(row[col.def]) || null, dates: clean(row[col.dates]), instagram: cleanInstagram(row[col.ig]),
        content: clean(row[col.content]), production: clean(row[col.production]), pmName: clean(row[col.pm]) || null, cmName: clean(row[col.cm]) || null,
        report: clean(row[col.report]), status: clean(row[col.status]), observations: [], agency: null, complexity: null, service: '',
      };
      const key = normalizeName(name);
      const previous = byName.get(key);
      if (previous) {
        const same = JSON.stringify({ ...previous, name: '' }) === JSON.stringify({ ...record, name: '' });
        if (same) doubts.push(`${name} aparece repetido en INDICADORES con los mismos datos: se unió en uno.`);
        else {
          // Manda la fila de vigencia más reciente (o la más completa); la otra solo llena lo que falta.
          const startOf = (r) => parseVigencia(r.dates, { year })?.startDate || '';
          const filled = (r) => Object.values(r).filter((v) => v && (!Array.isArray(v) || v.length)).length;
          const recordWins = startOf(record) > startOf(previous) || (startOf(record) === startOf(previous) && filled(record) > filled(previous));
          const [base, other] = recordWins ? [record, previous] : [previous, record];
          const merged = { ...base };
          for (const [field, value] of Object.entries(other)) if (!merged[field] && value) merged[field] = value;
          byName.set(key, merged);
          doubts.push(`${name} aparece dos veces en INDICADORES con datos distintos: se completaron entre sí y mandó la fila ${startOf(base) ? `de vigencia ${base.dates}` : 'más completa'}.`);
        }
        continue;
      }
      byName.set(key, record);
    }
  }

  const findRecord = (name) => {
    const key = normalizeName(name);
    if (byName.has(key)) return byName.get(key);
    const candidates = [...byName.entries()].filter(([k]) => k.length >= 4 && key.length >= 4 && (k.includes(key) || key.includes(k)));
    return candidates.length === 1 ? candidates[0][1] : null;
  };

  const mi = headerIndex(mio, 'Clientes');
  if (mi >= 0) {
    const h = mio[mi];
    const col = {
      uni: column(h, 'UNI'), name: column(h, 'Clientes'), agency: column(h, 'Agencia'), complexity: column(h, 'Nivel de complejidad'),
      responsible: column(h, 'Responsable'), service: column(h, 'Servicio'), notes: column(h, 'OBSERVACIONES'),
    };
    for (const row of mio.slice(mi + 1)) {
      const name = clean(row[col.name]);
      if (!clean(row[col.uni]) || !name) continue;
      let record = findRecord(name);
      if (!record) {
        record = { name, description: null, dates: '', instagram: null, content: '', production: '', pmName: null, cmName: null, report: '', status: '', observations: [], agency: null, complexity: null, service: '' };
        byName.set(normalizeName(name), record);
      }
      const agency = plain(row[col.agency]).trim();
      record.agency = agency === 'mio' ? 'MIO' : agency === 'brain' ? 'BRAIN' : record.agency;
      record.complexity = COMPLEXITY[plain(row[col.complexity]).trim()] || record.complexity;
      record.cmName = clean(row[col.responsible]) || record.cmName;
      record.service = clean(row[col.service]);
      const note = clean(row[col.notes]);
      if (note) record.observations.push(note);
    }
  }

  const generalDoubts = doubts;
  const clients = [...byName.values()].map((record) => {
    // Las dudas de un cliente viajan con él hasta el informe de la carga.
    const doubts = [];
    const fromService = parseDeliverables(record.service);
    const fromContent = parseDeliverables(record.content);
    const parsed = fromService.deliverables.length ? fromService : fromContent.deliverables.length ? fromContent : (fromService.total ? fromService : fromContent);
    const text = `${record.content} ${record.service}`;
    const vigencia = parseVigencia(record.dates, { year });
    const neutral = /neutro/.test(plain(record.status)) && !parsed.total && !record.content;
    const standBy = /no continua|en pausa|stand by/.test(plain(`${record.observations.join(' ')} ${record.status}`));
    let contract = null;
    if (!neutral && (parsed.total || record.content || record.service)) {
      const deliverables = parsed.deliverables.length ? parsed.deliverables : parsed.total ? [{ format: 'Otro', quantity: parsed.total }] : [];
      if (parsed.doubt) doubts.push(`${record.name}: ${parsed.doubt}${!parsed.deliverables.length && parsed.total ? ` (se cargó como ${parsed.total} piezas de formato «Otro»)` : ''}.`);
      contract = {
        serviceType: deliverables.length ? 'PARRILLA' : 'SERVICIOS',
        status: standBy ? 'STAND_BY' : 'ACTIVO',
        startDate: vigencia?.startDate || null,
        endDate: vigencia?.endDate || null,
        cutDay: 1,
        deliverables,
        storiesPerWeek: parseStories(text),
        productionDays: parseProductionDays(text, record.production),
        monthlyReport: /^(ok|si)$/.test(plain(record.report).trim()) || /informe/.test(plain(text)),
        notes: clean(`Del Excel: ${[record.content, record.service].filter(Boolean).join(' · ')}`).slice(0, 2000),
      };
      if (!vigencia && record.dates) doubts.push(`${record.name}: la vigencia «${record.dates}» no trae dos fechas; revisar inicio y fin en la ficha.`);
      if (vigencia && Number(vigencia.startDate.slice(8)) !== 1) doubts.push(`${record.name}: el contrato empieza el día ${Number(vigencia.startDate.slice(8))}. Si su parrilla va del ${Number(vigencia.startDate.slice(8))} al ${Number(vigencia.startDate.slice(8)) - 1}, cambia el ciclo en la ficha.`);
    } else if (neutral) {
      doubts.push(`${record.name}: figura como «Neutro» y sin contenidos; no se le cargó contrato.`);
    }
    if (/cliente que se va/.test(plain(record.content + record.status + record.observations.join(' ')))) doubts.push(`${record.name}: el Excel dice «cliente que se va»; confirmar si se termina el contrato.`);
    return {
      name: record.name, description: record.description, instagramUrl: record.instagram, agency: record.agency, complexity: record.complexity,
      pmName: record.pmName, cmName: record.cmName, monthlyReport: contract?.monthlyReport || false, contract, observations: record.observations,
      doubts,
    };
  });
  return { clients, generalDoubts, doubts: [...generalDoubts, ...clients.flatMap((c) => c.doubts)] };
}

const firstName = (value) => plain(value).replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/)[0] || '';

function resolveMember(name, team, doubts, context) {
  const first = firstName(name);
  if (!first) return null;
  const matches = team.filter((m) => m.isActive && firstName(m.name) === first);
  if (matches.length === 1) return matches[0];
  doubts.push(matches.length ? `${context}: «${name}» coincide con varias personas del equipo; no se asignó.` : `${context}: «${name}» no es una persona activa del equipo; no se asignó.`);
  return null;
}

/**
 * Qué escribiría la carga. La plataforma manda: solo se llenan campos vacíos, solo recibe contrato quien
 * no tiene ninguno, y cada diferencia se informa para que una persona decida.
 */
export function planImport({ excelClients, platformClients, team, today, doubts: readDoubts = [] }) {
  const doubts = [...readDoubts];
  const differences = [];
  const notFound = [];
  const updates = [];
  const tasks = [];
  const archived = [];
  const monthStart = `${today.slice(0, 7)}-01`;
  const memberName = (id) => team.find((m) => m.id === id)?.name || 'otra persona';

  const byKey = new Map(platformClients.map((c) => [normalizeName(c.name), c]));
  const matchPlatform = (name) => {
    const key = normalizeName(name);
    if (byKey.has(key)) return byKey.get(key);
    const candidates = platformClients.filter((c) => {
      const k = normalizeName(c.name);
      return k.length >= 4 && key.length >= 4 && (k.includes(key) || key.includes(k));
    });
    if (candidates.length > 1) doubts.push(`${name}: se parece a varios clientes de la plataforma (${candidates.map((c) => c.name).join(', ')}); no se cargó.`);
    return candidates.length === 1 ? candidates[0] : null;
  };

  const used = new Set();
  for (const excel of excelClients) {
    doubts.push(...(excel.doubts || []));
    const client = matchPlatform(excel.name);
    if (!client) { if (!doubts.some((d) => d.startsWith(`${excel.name}: se parece`))) notFound.push(excel.name); continue; }
    if (client.isArchived) { archived.push(client.name); continue; }
    if (used.has(client.id)) { doubts.push(`${excel.name}: corresponde a ${client.name}, que ya recibió otra fila del Excel; se ignoró esta.`); continue; }
    used.add(client.id);

    const context = `${client.name}`;
    const data = {};
    const fill = (field, value, label) => {
      if (value === null || value === undefined || value === '') return;
      if (client[field] === null || client[field] === undefined || client[field] === '') data[field] = value;
      else if (client[field] !== value && label) differences.push({ clientId: client.id, client: client.name, text: `${label}: la plataforma dice «${client[field]}» y el Excel «${value}». Se dejó lo de la plataforma.` });
    };
    fill('description', excel.description, null);
    fill('instagramUrl', excel.instagramUrl, 'Instagram');
    fill('agency', excel.agency, 'Agencia');
    fill('complexity', excel.complexity, 'Complejidad');

    const pm = excel.pmName ? resolveMember(excel.pmName, team, doubts, `${context} (project manager)`) : null;
    if (pm) {
      if (!client.projectManagerId) data.projectManagerId = pm.id;
      else if (client.projectManagerId !== pm.id) differences.push({ clientId: client.id, client: client.name, text: `Project manager: la plataforma tiene a ${memberName(client.projectManagerId)} y el Excel a ${pm.name}. Se dejó lo de la plataforma.` });
    }
    const cm = excel.cmName ? resolveMember(excel.cmName, team, doubts, `${context} (community manager)`) : null;
    if (cm) {
      if (!client.responsibleId) data.responsibleId = cm.id;
      else if (client.responsibleId !== cm.id) differences.push({ clientId: client.id, client: client.name, text: `Community manager: la plataforma tiene a ${memberName(client.responsibleId)} y el Excel a ${cm.name}. Se dejó lo de la plataforma.` });
    }

    let contract = null;
    if (excel.contract && (client.contracts || []).length) {
      differences.push({ clientId: client.id, client: client.name, text: 'Ya tiene contrato en la plataforma; el del Excel no se cargó.' });
    } else if (excel.contract) {
      const candidate = { ...excel.contract };
      if (!candidate.startDate) {
        candidate.startDate = monthStart;
        doubts.push(`${client.name}: el Excel no trae fecha de inicio; el contrato queda desde el ${monthStart} para medir desde ahora. Corrígelo en la ficha.`);
      }
      if (candidate.endDate && candidate.endDate < today) doubts.push(`${client.name}: según el Excel, el contrato venció el ${candidate.endDate}; confirmar si se renovó.`);
      const check = normalizeOperationProfile({ contract: candidate });
      if (check.valid) contract = check.value.contract;
      else doubts.push(`${client.name}: el contrato del Excel no pasó la validación (${Object.values(check.errors).join(' ')}); no se cargó.`);
    }

    updates.push({ clientId: client.id, client: client.name, data, contract });

    if (excel.observations.length) {
      tasks.push({
        clientId: client.id,
        assigneeId: client.responsibleId || cm?.id || null,
        title: 'Pendientes que venían del Excel',
        comments: excel.observations.map((text) => `- ${text}`).join('\n'),
      });
    }
  }
  return { updates, tasks, differences, doubts, notFound, archived };
}
