// Parte un documento de claves del Drive en cuentas sueltas: plataforma, usuario, contraseña, enlace y notas
// (9 de octubre de 2026). La primera carga guardó cada documento como un bloque de texto; la tarjeta lo
// mostraba como un volcado y una cuenta repetida en dos documentos salía dos veces. Rodny: «solo hay un
// CapCut … se ve terrible la forma en que lo muestra».
//
// Entiende tres formas, las que tienen los documentos reales:
//   1. tabla aplanada: una cabecera («PLATAFORMA / ACCESO», «|USUARIO / CORREO», «|CONTRASEÑA»…) y luego
//      una celda por línea, empezando con «|» o con tabulador; una línea sin prefijo continúa la celda;
//   2. hoja de cálculo exportada: columnas separadas por «|» con una fila de cabecera;
//   3. notas libres: un título, un usuario o correo y «Contraseña: …» / «Clave: …».
// Lo que no reconoce como cuenta con seguridad no se descarta: vuelve en `leftover`, para guardarlo como nota.
// Es lógica pura y nunca registra nada: recibe y devuelve secretos, así que no imprime ni lanza con valores.

import { createHash } from 'node:crypto';

const fold = (value) => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const PLACEHOLDER = /^(?:[-—–_.*\s]*|n\/?a|no aplica|sin dato)$/i;
const clean = (value) => { const text = String(value ?? '').trim(); return PLACEHOLDER.test(text) ? '' : text; };
const URL_RE = /^https?:\/\/\S+$/i;
const EMAIL_RE = /^[^\s@:]+@[^\s@]+\.[^\s@]+$/;

// Nombre canónico de las plataformas conocidas; el resto se deja como lo escribió el equipo.
const CANONICAL = ['Instagram', 'Facebook', 'Meta Business', 'Business Manager', 'TikTok', 'CapCut', 'Canva Pro', 'Canva', 'Gmail', 'Google Ads', 'Google Analytics', 'Google', 'YouTube', 'LinkedIn', 'Twitter', 'Pinterest', 'WhatsApp', 'Hostinger', 'GoDaddy', 'WordPress', 'Wix', 'Shopify', 'Mailchimp', 'Spotify', 'Freepik', 'Envato', 'Adobe', 'Figma', 'Dropbox', 'iCloud', 'Outlook', 'Hotmail', 'Zoom', 'Basecamp', 'ChatGPT', 'Notion', 'Behance', 'Linktree', 'Booking', 'Airbnb', 'TripAdvisor', 'Metricool', 'Microsoft', 'Zoho', 'Biosite'];
const CANONICAL_KEYS = CANONICAL.map((name) => [fold(name).replace(/ /g, ''), name]);
const canonicalPlatform = (raw) => {
  const text = clean(raw).replace(/[\s:;,.]+$/, '').trim();
  if (!text) return '';
  const compact = fold(text).replace(/ /g, '');
  for (const [key, name] of CANONICAL_KEYS) {
    if (compact === key) return name;
    // «Youtube Oficial» → «YouTube Oficial»: solo se corrige la primera palabra.
    const first = fold(text.split(/\s+/)[0]);
    if (first === key && text.includes(' ')) return `${name}${text.slice(text.split(/\s+/)[0].length)}`;
  }
  return text.slice(0, 60);
};
const isKnownPlatform = (text) => { const compact = fold(String(text).replace(/:\s*$/, '')).replace(/ /g, ''); return CANONICAL_KEYS.some(([key]) => key === compact); };

const roleOf = (header) => {
  const text = fold(header);
  if (!text) return null;
  if (/^cliente/.test(text)) return 'client';
  if (/contrasen|clave|password|^pass\b/.test(text)) return 'secret';
  if (/usuario|correo|^user|e-?mail|login/.test(text)) return 'username';
  if (/observ|nota/.test(text)) return 'notes';
  if (/^link|^url|enlace/.test(text)) return 'url';
  if (/plataforma|aplicacion|^app\b|herramienta|red social|^acceso|^cuenta|servicio|^sitio/.test(text)) return 'platform';
  return null;
};

const LABELS = {
  username: /^(?:usuario|user|correo(?: electr[oó]nico)?|e-?mail|login)\s*[:=]\s*(.*)$/i,
  secret: /^(?:contrase[nñ]a|clave|password|pass|pw)\s*[:=]\s*(.*)$/i,
  url: /^(?:link|url|enlace)\s*[:=]\s*(.*)$/i
};

export const accessFingerprint = ({ platform, username, secret }) => createHash('sha256')
  .update(`${fold(platform).replace(/ /g, '')}|${String(username || '').trim().toLowerCase()}|${secret || ''}`).digest('hex');

// Una «contraseña» de menos de cuatro caracteres es una marca o un error de la hoja, no una clave: se guarda
// como nota de la cuenta, nunca se pierde, pero no la convierte en un acceso.
const MIN_SECRET = 4;
const isSecret = (value) => String(value || '').length >= MIN_SECRET;

const joinNotes = (...parts) => parts.flat().map((part) => String(part || '').trim()).filter(Boolean).join('\n') || null;

// Una fila de tabla → cuenta, o null si no tiene ni usuario ni contraseña.
const rowToEntry = (row) => {
  const notes = [];
  let username = row.username || '';
  let url = row.url || '';
  if (URL_RE.test(username)) { url ||= username; username = ''; }
  const platform = canonicalPlatform(row.platform) || (EMAIL_RE.test(username) ? 'Correo' : '');
  if (!username && !row.secret) return null;
  notes.push(...(row.extra || []));
  if (row.notes) notes.push(row.notes);
  const secret = isSecret(row.secret) ? row.secret : null;
  if (row.secret && !secret) notes.push(`Contraseña: ${row.secret}`);
  return { platform: platform || 'Sin plataforma', username: username || null, secret, url: url || null, notes: joinNotes(notes), clientLabel: row.client || null };
};

export const parseAccessText = (text) => {
  const lines = String(text ?? '').split(/\r?\n/).map((line) => line.replace(/\s+$/, ''));
  const entries = [];
  const leftover = [];
  let record = null;

  const startRecord = () => ({ title: null, username: null, secret: null, url: null, notes: [], raw: [] });
  const closeRecord = () => {
    if (!record) return;
    if (isSecret(record.secret) && (record.title || record.username)) {
      const platform = canonicalPlatform(record.title) || (record.username && EMAIL_RE.test(record.username) ? 'Correo' : 'Sin plataforma');
      entries.push({ platform, username: record.username || null, secret: record.secret, url: record.url || null, notes: joinNotes(record.notes), clientLabel: null });
    } else if (record.raw.length) leftover.push(...record.raw, '');
    record = null;
  };

  // El Access Book exportado escribe « | valor»: el prefijo puede llevar espacios delante.
  const prefixed = (line) => /^\s*\|/.test(line) || /^\t/.test(line);
  const prefixValue = (line) => line.replace(/^\s*\||^\t/, '');

  // 1. Tabla aplanada. Devuelve el índice donde terminó, o -1 si no hay tabla aquí.
  const flatTable = (start) => {
    const first = lines[start];
    const firstRole = roleOf(prefixed(first) ? prefixValue(first) : first);
    if (!firstRole || !['platform', 'client'].includes(firstRole)) return -1;
    const roles = [firstRole];
    let j = start + 1;
    while (j < lines.length && prefixed(lines[j]) && roleOf(prefixValue(lines[j]))) { roles.push(roleOf(prefixValue(lines[j]))); j += 1; }
    if (roles.length < 3 || !roles.includes('secret')) return -1;
    if (!roles.includes('platform')) roles[0] = 'platform';
    const cells = [];
    for (; j < lines.length; j += 1) {
      const line = lines[j];
      if (prefixed(line)) cells.push({ value: clean(prefixValue(line)), extra: [] });
      else if (!line.trim()) break;
      else if (cells.length) { const more = clean(line); if (more) cells.at(-1).extra.push(more); }
      else break;
    }
    const width = roles.length;
    const complete = cells.length - (cells.length % width);
    for (let k = 0; k < complete; k += width) {
      const row = { extra: [] };
      roles.forEach((role, c) => {
        const cell = cells[k + c];
        if (role === 'secret') { row.secret = cell.value; row.extra.push(...cell.extra); }
        else if (role === 'notes') row.notes = joinNotes(cell.value, cell.extra);
        else { row[role] = cell.value; row.extra.push(...cell.extra); }
      });
      const entry = rowToEntry(row);
      if (entry) entries.push(entry);
      else if (row.notes) leftover.push(`${clean(row.platform) || 'Nota'}: ${row.notes}`);
    }
    for (const cell of cells.slice(complete)) leftover.push(...[cell.value, ...cell.extra].filter(Boolean));
    return j;
  };

  // 2. Hoja de cálculo exportada: columnas separadas por «|».
  const sheetTable = (start) => {
    const header = lines[start];
    if (prefixed(header) || !header.includes('|')) return -1;
    if (/^\s*\|/.test(header)) return -1;
    const roles = header.split('|').map((cell) => roleOf(cell.trim()));
    if (!roles.includes('secret') || roles.filter(Boolean).length < 2) return -1;
    if (!roles.includes('platform') && roles[0] == null) roles[0] = 'platform';
    let j = start + 1;
    for (; j < lines.length; j += 1) {
      const line = lines[j];
      if (!line.trim() || !line.includes('|') || /^===/.test(line.trim())) break;
      const cells = line.split('|').map(clean);
      const row = { extra: [] };
      cells.forEach((value, c) => {
        if (!value) return;
        const role = roles[c];
        if (role && !row[role]) row[role] = value;
        else row.extra.push(value);
      });
      const entry = rowToEntry(row);
      if (entry) entries.push(entry);
      else if (cells.some(Boolean)) leftover.push(cells.filter(Boolean).join(' · '));
    }
    return j;
  };

  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/^===.*===$/.test(trimmed) || /^\[archivo:/.test(trimmed)) { closeRecord(); i += 1; continue; }
    const tableEnd = Math.max(flatTable(i), sheetTable(i));
    if (tableEnd > i) { closeRecord(); i = tableEnd; continue; }
    i += 1;
    if (!trimmed) continue;
    record ||= startRecord();
    const add = (field, value) => { record[field] = value; record.raw.push(trimmed); };

    let match;
    if ((match = trimmed.match(LABELS.secret))) {
      if (record.secret) { closeRecord(); record = startRecord(); }
      if (clean(match[1])) add('secret', clean(match[1])); else record.raw.push(trimmed);
      continue;
    }
    if ((match = trimmed.match(LABELS.username))) {
      if (record.secret) { closeRecord(); record = startRecord(); }
      if (clean(match[1])) add('username', clean(match[1])); else record.raw.push(trimmed);
      continue;
    }
    if ((match = trimmed.match(LABELS.url)) || URL_RE.test(trimmed)) {
      if (record.secret) { closeRecord(); record = startRecord(); }
      add('url', match ? clean(match[1]) : trimmed);
      continue;
    }
    const withEmail = trimmed.match(/^(.*?)\s*[:\s]\s*([^\s:]+@[^\s@]+\.[^\s@]+)$/);
    if (EMAIL_RE.test(trimmed) || withEmail) {
      const email = EMAIL_RE.test(trimmed) ? trimmed : withEmail[2];
      const prefix = EMAIL_RE.test(trimmed) ? '' : withEmail[1].replace(/:\s*$/, '').trim();
      if (record.secret || (record.username && prefix)) { closeRecord(); record = startRecord(); }
      if (prefix && !LABELS.username.test(`${prefix}:`) && !roleOf(prefix)) record.title ||= prefix;
      if (!record.username) add('username', email); else { record.notes.push(trimmed); record.raw.push(trimmed); }
      continue;
    }
    // Texto suelto: un nombre de plataforma o un título abre cuenta; tras el usuario, una palabra sin espacios
    // es la contraseña que nadie rotuló.
    if (record.secret || (isKnownPlatform(trimmed) && (record.title || record.username))) { closeRecord(); record = startRecord(); }
    if (!record.title && !record.username) { record.title = trimmed.replace(/:\s*$/, ''); record.raw.push(trimmed); continue; }
    if (!/\s/.test(trimmed) && trimmed.length <= 60) {
      if (!record.username) { add('username', trimmed); continue; }
      if (!record.secret) { add('secret', trimmed); continue; }
    }
    record.notes.push(trimmed); record.raw.push(trimmed);
  }
  closeRecord();
  return { entries, leftover: leftover.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
};
