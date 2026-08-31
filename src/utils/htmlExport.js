import { COLORS, ICONS, getBrainStudioLogoSVG } from './reportStyling.js';
import { buildReportFileName } from '../lib/reportPresentation.js';

export { buildReportFileName };

const esc = (value) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const array = (value) => (Array.isArray(value) ? value : value ? [value] : []).filter(Boolean);
const text = (value) => typeof value === 'string' ? value.trim() : '';

const parseLabeled = (value) => {
  if (value && typeof value === 'object') return value;
  const raw = text(value);
  const result = { raw };
  const labels = 'Tarea|Acción|Titulo|Título|Descripcion|Descripción|Prioridad|Responsable|Owner|Fecha|Objetivo|Impacto|Pasos tácticos';
  const expression = new RegExp(`(?:^|\\s+-\\s+)(${labels}):\\s*([\\s\\S]*?)(?=\\s+-\\s+(?:${labels}):|$)`, 'gi');
  for (const match of raw.matchAll(expression)) {
    const key = match[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replaceAll(' ', '_');
    result[key] = match[2].trim();
  }
  return result;
};

const field = (item, keys, fallback = '') => {
  for (const key of keys) {
    const value = item?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return fallback;
};

const sharedStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
  @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}html{background:#eef6f4}body{margin:0;padding:28px;background:linear-gradient(145deg,#f6faf9 0%,#edf6f4 48%,#e8f3f1 100%);color:${COLORS.text};font-family:'Plus Jakarta Sans',Arial,sans-serif;-webkit-font-smoothing:antialiased;print-color-adjust:exact;-webkit-print-color-adjust:exact}.report{max-width:1440px;margin:auto;background:linear-gradient(150deg,#f4f9f8 0%,#edf6f4 100%);border:.7px solid rgba(13,151,166,.16);border-radius:14px;overflow:hidden}.cover{min-height:680px;padding:72px;display:flex;flex-direction:column;justify-content:space-between;color:#fff;position:relative;overflow:hidden;background:linear-gradient(135deg,#0D97A6 0%,#12A6A6 54%,#2DA683 100%)}.cover:before{content:'';position:absolute;inset:0;opacity:.13;background-image:radial-gradient(rgba(255,255,255,.38) .55px,transparent .65px);background-size:4px 4px;mix-blend-mode:soft-light}.cover:after{content:'';position:absolute;width:520px;height:520px;right:-170px;top:-220px;border:.7px solid rgba(255,255,255,.18);border-radius:50%;box-shadow:0 0 0 90px rgba(255,255,255,.025),0 0 0 180px rgba(255,255,255,.016)}.cover>*{position:relative;z-index:1}.cover-top{display:flex;justify-content:space-between;align-items:flex-start}.report-type{font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:8px 12px;border:.7px solid rgba(255,255,255,.38);border-radius:999px;background:rgba(7,93,100,.12)}.cover h1{max-width:950px;margin:42px 0 0;font-size:clamp(52px,6vw,86px);line-height:.98;letter-spacing:-.055em;font-weight:700}.subtitle{max-width:760px;margin-top:24px;font-size:24px;line-height:1.35;color:rgba(255,255,255,.86)}.meta{display:grid;grid-template-columns:repeat(2,minmax(0,220px));gap:32px;padding-top:24px;border-top:.7px solid rgba(255,255,255,.3)}.meta-label{font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.65)}.meta-value{margin-top:7px;font-size:15px;font-weight:600}.content{padding:48px}.content-kicker{display:flex;justify-content:space-between;gap:24px;margin-bottom:28px;padding-bottom:16px;border-bottom:.7px solid rgba(13,151,166,.18);font-size:10px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:${COLORS.textLight}}section{margin-bottom:28px;padding:32px;background:linear-gradient(145deg,#fff 0%,#fbfdfc 100%);border:.7px solid rgba(13,151,166,.16);border-radius:12px;box-shadow:0 8px 24px rgba(7,93,100,.035);break-inside:avoid;page-break-inside:avoid}.section-heading{display:flex;align-items:center;gap:12px;margin-bottom:24px;padding-bottom:16px;border-bottom:.7px solid rgba(13,151,166,.16)}.section-icon{display:inline-grid;place-items:center;width:38px;height:38px;border:.7px solid rgba(13,151,166,.22);border-radius:9px;background:linear-gradient(145deg,#fff 0%,#edf8f6 100%)}.section-heading h2{margin:0;color:${COLORS.ink};font-size:23px;line-height:1.2;letter-spacing:-.025em}.editorial-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.editorial-card{min-height:118px;padding:22px;background:linear-gradient(145deg,#fff 0%,#f4f9f8 100%);border:.7px solid rgba(13,151,166,.16);border-radius:10px;position:relative}.editorial-card:nth-child(4n+2),.editorial-card:nth-child(4n+3){background:linear-gradient(145deg,#f5fbf9 0%,#e6f3f0 100%)}.item-index{display:inline-block;margin-bottom:16px;color:${COLORS.primaryDeep};font-size:9px;font-weight:800;letter-spacing:.12em;padding:4px 7px;border-radius:999px;background:rgba(18,166,166,.08)}.editorial-card p{margin:0;font-size:15px;line-height:1.65;color:${COLORS.text}}.prose-list{columns:2;column-gap:58px;margin:0;padding:0;list-style:none}.prose-list li{position:relative;break-inside:avoid;margin:0 0 20px;padding-left:20px;font-size:15px;line-height:1.72}.prose-list li:before{content:'';position:absolute;left:0;top:.72em;width:8px;height:2px;border-radius:2px;background:${COLORS.primary}}.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.metric{padding:24px;background:linear-gradient(145deg,#fff 0%,#edf7f5 100%);border:.7px solid rgba(13,151,166,.18);border-radius:10px}.metric-label{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${COLORS.textLight}}.metric-value{margin-top:12px;font-size:38px;line-height:1;font-weight:600;letter-spacing:-.045em;color:${COLORS.primaryDeep}}.metric-note{margin-top:12px;font-size:12px;line-height:1.55;color:${COLORS.textLight}}.table-shell{overflow:hidden;border:.7px solid rgba(13,151,166,.18);border-radius:10px}.action-table{width:100%;border-collapse:collapse}.action-table th{padding:12px 14px;text-align:left;background:#075D64;color:#fff;font-size:9px;text-transform:uppercase;letter-spacing:.1em}.action-table td{padding:17px 14px;border-bottom:.7px solid ${COLORS.border};font-size:13px;line-height:1.55;vertical-align:top}.action-table tr:last-child td{border-bottom:0}.action-table tr:nth-child(even) td{background:#f2f8f6}.number{color:${COLORS.primaryDeep};font-weight:800}.tag{display:inline-block;padding:5px 8px;background:${COLORS.mist};color:${COLORS.primaryDeep};border:.7px solid rgba(13,151,166,.14);border-radius:999px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.signal-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.signal{padding:24px;border:.7px solid rgba(13,151,166,.18);border-top:3px solid ${COLORS.primary};border-radius:10px;background:linear-gradient(145deg,#fff 0%,#f5faf9 100%);min-height:150px}.signal h3{margin:0 0 10px;font-size:18px;line-height:1.35;color:${COLORS.ink}}.signal p{margin:0;font-size:14px;line-height:1.7;color:${COLORS.text}}.recommendations .signal:nth-child(3n+2){border-top-color:${COLORS.secondary}}.recommendations .signal:nth-child(3n+3){border-top-color:${COLORS.accent}}.empty{padding:20px;background:linear-gradient(145deg,#f4faf8,#e8f4f2);border-radius:10px;color:${COLORS.textLight};font-size:14px}.footer{display:flex;justify-content:space-between;padding:18px 48px;background:#075D64;color:rgba(255,255,255,.75);font-size:10px;text-transform:uppercase;letter-spacing:.09em}@media(max-width:900px){body{padding:0}.report{border-radius:0}.cover{min-height:560px;padding:42px}.content{padding:24px}.editorial-grid,.signal-grid,.metrics{grid-template-columns:1fr}.prose-list{columns:1}.cover h1{font-size:48px}}@media print{html,body{background:#fff}body{padding:0}.report{max-width:none;border:0;border-radius:0}.cover{min-height:174mm;break-after:page;page-break-after:always}.content{padding:0}.content-kicker{margin-top:0}.footer{margin-top:18px}section,.editorial-card,.signal,.metric,.table-shell{break-inside:avoid;page-break-inside:avoid}}
  @page{size:A4 landscape;margin:0}
  @media print{.cover{min-height:210mm;padding:16mm}.content{padding:10mm 12mm}.metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.editorial-grid,.signal-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.prose-list{columns:2}.footer{margin:0 12mm 8mm}}
  @media print{.report{position:relative;padding-bottom:14mm}.footer{position:absolute;left:12mm;right:12mm;bottom:0;margin:0}}
  @media print{.footer{position:fixed}}
  @media print{.report{padding-bottom:0}.footer{display:none}section{margin-bottom:18px;padding:24px;break-inside:auto;page-break-inside:auto}.section-heading{margin-bottom:16px;padding-bottom:12px;break-after:avoid-page;page-break-after:avoid}.section-heading,.editorial-card,.signal,.metric,.prose-list li,.action-table tr{break-inside:avoid;page-break-inside:avoid}.editorial-card{min-height:0;padding:14px 16px}.editorial-card .item-index{margin-bottom:8px}.editorial-card p{font-size:12px;line-height:1.45}.action-table thead{display:table-header-group}.table-shell{overflow:visible}.metrics-2{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;

const heading = (icon, title) => `<div class="section-heading"><span class="section-icon">${icon}</span><h2>${esc(title)}</h2></div>`;
const list = (items) => `<ul class="prose-list">${array(items).map((item) => `<li>${esc(typeof item === 'string' ? item : field(item,['description','title','text']))}</li>`).join('')}</ul>`;
const cards = (items) => `<div class="editorial-grid">${array(items).map((item,index) => `<article class="editorial-card"><span class="item-index">${String(index + 1).padStart(2,'0')}</span><p>${esc(typeof item === 'string' ? item : field(item,['description','title','text']))}</p></article>`).join('')}</div>`;

const cover = ({ type, title, subtitle, date, duration }) => `<div class="cover"><div><div class="cover-top">${getBrainStudioLogoSVG()}<span class="report-type">${esc(type)}</span></div><h1>${esc(title)}</h1>${subtitle ? `<div class="subtitle">${esc(subtitle)}</div>` : ''}</div><div class="meta"><div><div class="meta-label">Fecha de generación</div><div class="meta-value">${esc(date)}</div></div>${duration ? `<div><div class="meta-label">Duración</div><div class="meta-value">${esc(duration)}</div></div>` : ''}</div></div>`;
const shell = ({ title, coverHtml, type, body }) => `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${sharedStyles}</style></head><body><main class="report">${coverHtml}<div class="content"><div class="content-kicker"><span>${esc(type)}</span><span>Brainstudio Intelligence</span></div>${body}</div><footer class="footer"><span>Brainstudio Intelligence</span><span>Confidencial</span></footer></main></body></html>`;

const renderActions = (actions) => {
  const rows = array(actions).map(parseLabeled).map((item) => ({
    task: field(item,['task','tarea','accion','title','raw'],'Acción por definir'),
    owner: field(item,['owner','responsable'],'Por asignar'),
    due: field(item,['due_date','fecha'],'Sin fecha'),
    priority: field(item,['priority','prioridad'],'General'),
  })).filter((item) => item.task && item.task !== 'undefined');
  if (!rows.length) return '<div class="empty">No se detectaron acciones específicas en el material.</div>';
  return `<div class="table-shell"><table class="action-table"><thead><tr><th>#</th><th>Acción</th><th>Responsable</th><th>Fecha</th><th>Prioridad</th></tr></thead><tbody>${rows.map((item,index) => `<tr><td class="number">${String(index + 1).padStart(2,'0')}</td><td>${esc(item.task)}</td><td>${esc(item.owner)}</td><td>${esc(item.due)}</td><td><span class="tag">${esc(item.priority)}</span></td></tr>`).join('')}</tbody></table></div>`;
};

const renderSignals = (values, kind) => {
  const items = array(values).map(parseLabeled).map((item,index) => ({
    title: field(item,['title','titulo','task','tarea'], `${kind} ${String(index + 1).padStart(2,'0')}`),
    description: field(item,['description','descripcion','objetivo','impacto','pasos_tacticos','raw']),
    priority: field(item,['priority','prioridad']),
  })).filter((item) => item.description && item.description !== 'undefined');
  if (!items.length) return `<div class="empty">No se detectaron ${kind.toLowerCase()} explícitas en el material.</div>`;
  return `<div class="signal-grid ${kind === 'Recomendación' ? 'recommendations' : ''}">${items.map((item,index) => `<article class="signal"><span class="item-index">${String(index + 1).padStart(2,'0')}${item.priority ? ` · ${esc(item.priority)}` : ''}</span><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p></article>`).join('')}</div>`;
};

export const generateSummaryHTML = (data = {}, sourceTitle, reportMeta = {}) => {
  const date = new Date().toLocaleDateString('es-ES',{year:'numeric',month:'long',day:'numeric'});
  const title = reportMeta.reportTitle?.trim() || data.meeting_title?.trim() || sourceTitle || 'Resumen general';
  const subtitle = reportMeta.projectSubtitle?.trim();
  const participants = array(data.participants);
  const topics = array(data.meeting_topics);
  const details = array(data.discussion_details);
  const agreements = array(data.agreements);
  const durationText = text(data.meeting_duration);
  const durationMatch = durationText.match(/^([^()]+?)\s*\(([^)]+)\)\s*$/);
  const durationValue = durationMatch?.[1]?.trim() || durationText;
  const durationNote = durationMatch?.[2]?.trim() || 'Tiempo total reportado';
  const metrics = [participants.length ? `<div class="metric"><div class="metric-label">Participantes</div><div class="metric-value">${participants.length}</div><div class="metric-note">${esc(participants.slice(0,3).join(', '))}</div></div>` : '', durationValue ? `<div class="metric"><div class="metric-label">Duración</div><div class="metric-value">${esc(durationValue)}</div><div class="metric-note">${esc(durationNote)}</div></div>` : ''].filter(Boolean);
  const body = `${metrics.length ? `<section>${heading(ICONS.users,'Contexto de la reunión')}<div class="metrics metrics-${metrics.length}">${metrics.join('')}</div></section>` : ''}<section>${heading(ICONS.target,'Temas tratados')}${topics.length ? cards(topics) : '<div class="empty">Sin temas identificados.</div>'}</section><section>${heading(ICONS.lightning,'Puntos clave')}${details.length ? list(details) : '<div class="empty">Sin puntos clave identificados.</div>'}</section><section>${heading(ICONS.bulb,'Acuerdos y compromisos')}${agreements.length ? cards(agreements) : '<div class="empty">Sin acuerdos explícitos en el material.</div>'}</section><section>${heading(ICONS.calendar,'Próximos pasos')}${renderActions(data.action_items)}</section>`;
  return shell({title,type:'Resumen general',coverHtml:cover({type:'Resumen general',title,subtitle,date,duration:data.meeting_duration}),body});
};

export const generateAnalysisHTML = (data = {}, sourceTitle, reportMeta = {}) => {
  const date = new Date().toLocaleDateString('es-ES',{year:'numeric',month:'long',day:'numeric'});
  const title = reportMeta.reportTitle?.trim() || sourceTitle || 'Análisis estratégico';
  const subtitle = reportMeta.projectSubtitle?.trim();
  const body = `<section>${heading(ICONS.target,'Contexto y temas')}${array(data.meeting_topics).length ? list(data.meeting_topics) : '<div class="empty">Sin temas identificados.</div>'}</section><section>${heading(ICONS.lightning,'Insight consultivo')}${array(data.consulting_insights).length ? list(data.consulting_insights) : '<div class="empty">Sin insights disponibles.</div>'}</section><section>${heading(ICONS.bulb,'Observaciones críticas')}${array(data.observations).length ? list(data.observations) : '<div class="empty">Sin observaciones adicionales.</div>'}</section><section>${heading(ICONS.chart,'Oportunidades detectadas')}${renderSignals(data.opportunities,'Oportunidad')}</section><section>${heading(ICONS.calendar,'Recomendaciones estratégicas')}${renderSignals(data.recommendations,'Recomendación')}</section>`;
  return shell({title,type:'Análisis estratégico',coverHtml:cover({type:'Análisis estratégico',title,subtitle,date,duration:data.meeting_duration}),body});
};
