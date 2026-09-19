// Catalog descriptions arrive as running text ("Incluye: a, b y c.") and are
// stored as structured plain text so every quotation gets the same layout:
//
//   Concepto: una frase.
//   Incluye:
//   - Primer elemento
//   - Segundo elemento
//
// The plain form is what the seed keeps and what search and cards show; the
// HTML form is what the catalog modal edits and what a quotation item receives
// when the service is added.
import { proposalRichTextBlocks, sanitizeProposalHtml } from './quotationProposalDetails.js';

const BULLET = /^\s*(?:[-•*·]|\d+[.)])\s+/;
const LABEL = /^\s*([^:\n]{1,40}?)\s*:\s*(.*)$/;
// Hand-written descriptions often run "…comunicación. Incluye revisión, paleta
// y tipografías. No incluye impresión" with no colon: these labels are
// recognized at the start of a line or of a sentence.
const KNOWN_LABEL = /(?:^|(?<=[.;]\s))(no incluye|incluye|concepto|entregables|requisitos|condiciones|nota)\b\s*:?\s*/gi;
const INLINE_LABELS = new Set(['concepto', 'tiempo de servicio', 'nota', 'duración', 'duracion', 'frecuencia', 'entrega']);
const LEADING_CONNECTOR = /^(?:y|e|ni|o|u)\s+/i;
const CUMULATIVE = /\s(?:y|e|ni)\s/i;
const PREPOSITION = /(?:^|\s)(?:de|del|en|para|con|por|como|entre|a|al|sobre|hacia|según|segun)\s/i;
const INTRODUCER = /\b(?:como|tales como|entre|distribuid[oa]s en|puede incluir|incluyendo|compuest[oa] por|conformad[oa] por)\b/i;
const CLOSING_MARKER = /\s(?:u otr[oa]s?|o similares|o cualquier otr[oa]|entre otr[oa]s)\b/i;
const BARE_ALTERNATIVE = /^\S+\s(?:o|u)\s/i;
const ATTACHES_TO_PREVIOUS = /^(?:con|para|según|segun|sin|de|del|en|por|a|al|hasta|desde|incluyendo|más|mas|junto|es decir|o sea|siempre|cuando|si|sujeto|sujetos|sujeta|sujetas)\b/i;
const SENTENCE_BREAK = /(?<=\.)\s+(?=[A-ZÁÉÍÓÚÑ])/;

const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const capitalize = value => value.charAt(0).toUpperCase() + value.slice(1);
const clean = value => String(value ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
const stripTrailingPeriod = value => value.replace(/\s*[.;,]+$/u, '').trim();
const isHead = unit => PREPOSITION.test(unit) && !CUMULATIVE.test(unit);

// "Texto libre. Incluye a y b. No incluye c" ->
// [{ label: '', rest: 'Texto libre.' }, { label: 'Incluye', rest: 'a y b.' }, { label: 'No incluye', rest: 'c' }]
const segmentLine = line => {
  const segments = [];
  let label = '', start = 0;
  for (const match of line.matchAll(KNOWN_LABEL)) {
    const rest = line.slice(start, match.index).trim();
    if (label || rest) segments.push({ label, rest });
    label = capitalize(match[1].toLowerCase());
    start = match.index + match[0].length;
  }
  segments.push({ label, rest: line.slice(start).trim() });
  return segments;
};

// The closing connector of "a, b y c" is the first one; when that would leave
// a one-word head ("seguimiento y optimización … e informe"), the last one is
// the real closer.
const closingConnector = value => {
  const matches = [...value.matchAll(new RegExp(CUMULATIVE.source, 'gi'))];
  const head = value.slice(0, matches[0].index).trim();
  return matches.length > 1 && !/\s/.test(head) ? matches[matches.length - 1] : matches[0];
};
const mergeFrom = (units, index, part) => units.splice(index, units.length - index, [...units.slice(index), part].join(', '));

// "a, b, c y d; e, f ni g." -> ["a", "b", "c", "d", "e", "f", "g"].
// Groups end at ";". Inside a group the closing connector of the last comma
// element ends the enumeration; a bare "A y B" before that ("Facebook y
// TikTok", "4 piezas y 1 carrusel") closes a sub-list that belongs to the
// phrase right before it, so those pieces are kept together.
export const splitEnumeration = value => {
  const items = [];
  for (const group of stripTrailingPeriod(clean(value)).split(/\s*;\s*/)) {
    const parts = [];
    for (const raw of group.split(/\s*,\s*/)) {
      const part = raw.replace(LEADING_CONNECTOR, '').trim();
      if (!part) continue;
      if (parts.length && ATTACHES_TO_PREVIOUS.test(part)) parts[parts.length - 1] += `, ${part}`;
      else parts.push(part);
    }
    if (!parts.length) continue;
    // "puede incluir clientes, tareas, inventario o reportes" is one item.
    if (INTRODUCER.test(parts[0]) && !parts.some(part => CUMULATIVE.test(part))) { items.push(parts.join(', ')); continue; }
    // Units after the closing connector are final: never merged into a sub-list.
    let tail = [];
    // A lone "diagnóstico con hallazgos y recomendaciones" stays whole, but
    // "impresión ni pauta" is always two excluded items.
    if (CUMULATIVE.test(parts[parts.length - 1]) && (parts.length > 1 || /\sni\s/i.test(parts[0]))) {
      const last = parts.pop();
      const match = closingConnector(last);
      const head = last.slice(0, match.index).trim();
      const rest = last.slice(match.index + match[0].length).trim();
      if (!head || !rest) tail = [last];
      else if (CUMULATIVE.test(head)) tail = [head, rest];
      else { parts.push(head); tail = [rest]; }
    }
    const units = [];
    for (const part of parts) {
      if (CLOSING_MARKER.test(part)) {
        // "...u otro elemento" closes a sub-list that started right after the
        // previous closing connector, or inside it ("optimización y reporte
        // para campañas de búsqueda, display o similares").
        const previous = units.map(unit => CUMULATIVE.test(unit)).lastIndexOf(true);
        if (previous === units.length - 1 && previous >= 0) {
          const match = units[previous].match(CUMULATIVE);
          const opener = units[previous].slice(match.index + match[0].length).trim();
          units[previous] = units[previous].slice(0, match.index).trim();
          units.push(`${opener}, ${part}`);
        } else mergeFrom(units, previous + 1, part);
      } else if (CUMULATIVE.test(part) && !PREPOSITION.test(part) && units.length && isHead(units[units.length - 1])) {
        mergeFrom(units, units.length - 1, part);
      } else if (BARE_ALTERNATIVE.test(part) && units.length && INTRODUCER.test(units[units.length - 1]) && !CUMULATIVE.test(units[units.length - 1])) {
        mergeFrom(units, units.length - 1, part);
      } else units.push(part);
    }
    items.push(...units, ...tail);
  }
  return items.map(item => capitalize(stripTrailingPeriod(item))).filter(Boolean);
};

const finishSection = (sections, section) => { if (section) sections.push(section); };

// Sections: { label, text, items, notes }. "Concepto:" stays a sentence; any
// other label ("Incluye:", "No incluye:") becomes a list, and extra sentences
// after the enumeration stay as notes. Existing "- " lines are kept verbatim so
// hand-made adjustments survive another pass.
export const parseCatalogDescription = value => {
  const sections = [];
  let current = null;
  for (const rawLine of clean(value).split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (BULLET.test(line)) {
      if (!current || current.notes.length) { finishSection(sections, current); current = { label: '', text: '', items: [], notes: [] }; }
      current.items.push(capitalize(line.replace(BULLET, '').trim()));
      continue;
    }
    for (const segment of segmentLine(line)) {
      finishSection(sections, current);
      let { label, rest } = segment;
      if (!label) {
        const match = rest.match(LABEL);
        if (!match) { current = { label: '', text: rest, items: [], notes: [] }; continue; }
        label = capitalize(match[1].trim());
        rest = match[2].trim();
      }
      if (!rest || INLINE_LABELS.has(label.toLowerCase())) { current = { label, text: rest, items: [], notes: [] }; continue; }
      const [enumeration, ...notes] = rest.split(SENTENCE_BREAK);
      current = { label, text: '', items: splitEnumeration(enumeration), notes: notes.map(note => note.trim()).filter(Boolean) };
    }
  }
  finishSection(sections, current);
  return sections;
};

export const formatCatalogDescription = value => parseCatalogDescription(value).map(section => {
  const head = section.label ? `${section.label}:` : '';
  if (section.items.length) return [head, ...section.items.map(item => `- ${item}`), ...section.notes].filter(Boolean).join('\n');
  return [head ? `${head} ${section.text}` : section.text, ...section.notes].join('\n');
}).join('\n');

// Produces only tags accepted by sanitizeProposalHtml (p, strong, ul, li).
export const catalogDescriptionToHtml = value => parseCatalogDescription(value).map(section => {
  const label = section.label ? `<strong>${escapeHtml(section.label)}:</strong>` : '';
  const notes = section.notes.map(note => `<p>${escapeHtml(note)}</p>`).join('');
  if (section.items.length) {
    const list = `<ul>${section.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    return `${label ? `<p>${label}</p>` : ''}${list}${notes}`;
  }
  return `<p>${label}${label && section.text ? ' ' : ''}${escapeHtml(section.text)}</p>${notes}`;
}).join('');

// Editor HTML back to the stored plain form: bullets keep their "- " marker,
// everything else is one line per block.
export const proposalHtmlToCatalogText = html => proposalRichTextBlocks(html).map(block => {
  const text = block.runs.map(run => run.text).join('').replace(/\s+/g, ' ').trim();
  return block.bullet ? `- ${text}` : text;
}).filter(Boolean).join('\n');

// What a quotation item (or the modal) starts from: the rich version when the
// service was edited in the modal, otherwise the plain text rendered.
export const catalogServiceHtml = service => service?.descriptionHtml || catalogDescriptionToHtml(service?.description);

// Request body -> ServiceCatalog columns. The rich version wins when sent;
// the plain description is always derived from it so search, cards and seeds
// keep working on text.
export const resolveCatalogDescriptionInput = ({ description, descriptionHtml } = {}) => {
  if (descriptionHtml !== undefined && descriptionHtml !== null) {
    const html = sanitizeProposalHtml(descriptionHtml);
    const text = formatCatalogDescription(proposalHtmlToCatalogText(html));
    return { description: text, description_html: text ? html : null };
  }
  if (description !== undefined) return { description: formatCatalogDescription(description), description_html: null };
  return {};
};
