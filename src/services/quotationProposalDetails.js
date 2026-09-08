import DOMPurify from 'isomorphic-dompurify';

export class ProposalValidationError extends Error {
  constructor(message) { super(message); this.name = 'ProposalValidationError'; this.statusCode = 400; }
}
const fail = message => { throw new ProposalValidationError(message); };
const text = (value, max = 200) => {
  const result = String(value ?? '').trim();
  if (result.length > max) fail(`El texto supera el límite de ${max} caracteres`);
  return result;
};
const list = (value, max) => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max || value.some(row => !row || typeof row !== 'object' || Array.isArray(row))) fail(`Lista inválida; límite de ${max} elementos`);
  return value;
};
const unique = rows => { if (new Set(rows.map(row => row.id)).size !== rows.length) fail('Hay identificadores duplicados'); };
export const safeProposalLink = value => {
  try { const url = new URL(String(value)); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
};
export const sanitizeProposalHtml = value => {
  const html = text(value, 20000);
  const fragment = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'br', 'a'],
    ALLOWED_ATTR: ['href'], RETURN_DOM: true
  });
  fragment.querySelectorAll('a').forEach(link => {
    const href = safeProposalLink(link.getAttribute('href'));
    if (href) link.setAttribute('href', href); else link.removeAttribute('href');
  });
  return fragment.innerHTML;
};
export const proposalRichTextBlocks = value => {
  const root = DOMPurify.sanitize(sanitizeProposalHtml(value), { RETURN_DOM: true });
  const blocks = [];
  let current = null;
  const walk = (node, marks = {}, context = {}) => {
    if (node.nodeType === 3) {
      if (!current) { current = { ...context, runs: [] }; blocks.push(current); }
      current.runs.push({ text: node.textContent, ...marks }); return;
    }
    const tag = node.nodeName.toLowerCase();
    const block = ['p', 'h1', 'h2', 'h3', 'li'].includes(tag);
    const next = { ...marks };
    if (['strong', 'b'].includes(tag)) next.bold = true;
    if (['em', 'i'].includes(tag)) next.italic = true;
    if (tag === 'u') next.underline = true;
    if (tag === 'a' && safeProposalLink(node.getAttribute('href'))) next.href = safeProposalLink(node.getAttribute('href'));
    const ctx = { ...context, ...(tag === 'li' ? { bullet: true } : {}), ...(/^h[123]$/.test(tag) ? { heading: Number(tag[1]) } : {}) };
    if (tag === 'li' && node.parentNode?.nodeName === 'OL') ctx.ordinal = [...node.parentNode.children].indexOf(node) + 1;
    if (block) current = null;
    if (tag === 'br') walk({ nodeType: 3, textContent: '\n' }, next, ctx);
    else node.childNodes.forEach(child => walk(child, next, ctx));
    if (block) current = null;
  };
  root.childNodes.forEach(node => walk(node));
  return blocks.filter(block => block.runs.some(run => run.text.trim()));
};
export const proposalPlainText = html => proposalRichTextBlocks(html).map(block => block.runs.map(run => run.text).join('')).join('\n');
export const plainTextToProposalHtml = value => String(value || '').split('\n').map(line => `<p>${line.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</p>`).join('');

export const normalizeExecution = value => {
  if (!value) return null;
  const min = Number(value.min), max = Number(value.max ?? value.min);
  if (!Number.isInteger(min) || min < 1 || !Number.isInteger(max) || max < min || max > 3650 || !['DAYS', 'WEEKS', 'MONTHS'].includes(value.unit)) fail('La duración de ejecución no es válida');
  return { min, max, unit: value.unit, startNote: text(value.startNote, 500) };
};
export const formatExecution = value => value ? `${value.min}${value.max !== value.min ? `–${value.max}` : ''} ${{ DAYS: 'días', WEEKS: 'semanas', MONTHS: 'meses' }[value.unit]}${value.startNote ? ` · ${value.startNote}` : ''}` : '';
export const normalizeProposalItemFields = item => ({
  ...(item.descriptionHtml !== undefined ? { descriptionHtml: sanitizeProposalHtml(item.descriptionHtml), description: proposalPlainText(item.descriptionHtml) } : {}),
  ...(item.group !== undefined ? { group: text(item.group) } : {}),
  ...(item.execution !== undefined ? { execution: normalizeExecution(item.execution) } : {})
});
const cents = value => {
  const number = Number(value);
  const result = Math.round(number * 100);
  if (!Number.isFinite(number) || number < 0 || !Number.isSafeInteger(result)) fail('Importe fuera del rango permitido');
  return result;
};
// Largest remainder in integer cents: no money is created by installment rounding.
const allocate = (amount, weights) => {
  const sum = weights.reduce((a, b) => a + BigInt(b), 0n);
  if (!sum) return weights.map(() => 0);
  const products = weights.map(w => BigInt(amount) * BigInt(w));
  const values = products.map(product => Number(product / sum));
  const order = products.map((product, index) => ({ index, rest: product % sum })).sort((a, b) => a.rest === b.rest ? a.index - b.index : a.rest > b.rest ? -1 : 1);
  const remaining = amount - values.reduce((a, b) => a + b, 0);
  for (let i = 0; i < remaining; i++) values[order[i].index]++;
  return values;
};
export const calculateProposalPayments = (plan, totals) => {
  const amount = cents(totals.totalAmount), tax = cents(totals.taxAmount);
  if (tax > amount) fail('El impuesto supera el total');
  const weights = plan.installments.map(row => cents(row.value));
  if (!weights.length || weights.some(w => w <= 0)) fail('Cada cuota debe tener un importe o porcentaje positivo');
  if (plan.mode === 'PERCENTAGE' && weights.reduce((a, b) => a + b, 0) !== 10000) fail('Los porcentajes deben sumar 100%');
  if (plan.mode === 'FIXED' && weights.reduce((a, b) => a + b, 0) !== amount) fail('Las cuotas deben sumar el total de la propuesta, impuestos incluidos');
  if (!['FIXED', 'PERCENTAGE'].includes(plan.mode)) fail('Modalidad de cuotas inválida');
  const amounts = plan.mode === 'FIXED' ? weights : allocate(amount, weights);
  const taxes = allocate(tax, amounts);
  return plan.installments.map((row, i) => ({ ...row, amount: amounts[i] / 100, taxAmount: taxes[i] / 100, baseAmount: (amounts[i] - taxes[i]) / 100 }));
};
export const paymentPlanForScenario = (details, scenarioId = null) => details?.paymentPlans?.find(plan => plan.scenarioId === scenarioId) || details?.paymentPlans?.find(plan => plan.scenarioId === null) || null;
export const formatInstallmentDue = row => row.dueType === 'DATE' ? row.date?.split('-').reverse().join('/') : row.dueType === 'AFTER_START' ? `${row.days} días después del inicio` : row.milestone;

export const normalizeProposalDetails = (value, { issue = false, totalsByScenario } = {}) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value) || value.version !== 1) fail('Versión de propuesta no compatible');
  if (JSON.stringify(value).length > 120000) fail('La propuesta supera el límite de contenido');
  const phases = list(value.phases, 20).map(phase => ({
    id: text(phase.id, 100), title: text(phase.title), execution: normalizeExecution(phase.execution),
    starts: ['AT_START', 'AFTER_PREVIOUS', 'PARALLEL'].includes(phase.starts) ? phase.starts : 'AFTER_PREVIOUS',
    descriptionHtml: sanitizeProposalHtml(phase.descriptionHtml), completion: text(phase.completion, 500)
  }));
  if (phases.some(phase => !phase.id || (issue && !phase.title))) fail('Cada etapa necesita nombre e identificador');
  unique(phases);
  const paymentPlans = list(value.paymentPlans, 10).map(plan => {
    if (!['PERCENTAGE', 'FIXED'].includes(plan.mode)) fail('Modalidad de cuotas inválida');
    const installments = list(plan.installments, 24).map(row => {
      const parsed = { id: text(row.id, 100), label: text(row.label), value: Number(row.value || 0), dueType: row.dueType, date: text(row.date, 10), days: Number(row.days || 0), milestone: text(row.milestone, 500) };
      if (!parsed.id || !Number.isFinite(parsed.value) || parsed.value < 0 || Math.abs(parsed.value * 100 - Math.round(parsed.value * 100)) > 0.001) fail('Cuota inválida; usa hasta dos decimales');
      if (!['DATE', 'MILESTONE', 'AFTER_START'].includes(parsed.dueType)) fail('Vencimiento de cuota inválido');
      if (issue) {
        if (!parsed.label) fail('Cada cuota necesita un nombre');
        if (parsed.dueType === 'DATE' && (!/^\d{4}-\d{2}-\d{2}$/.test(parsed.date) || Number.isNaN(Date.parse(parsed.date)) || new Date(parsed.date).toISOString().slice(0, 10) !== parsed.date)) fail('Fecha de cuota inválida');
        if (parsed.dueType === 'MILESTONE' && !parsed.milestone) fail('Describe el hito de la cuota');
        if (parsed.dueType === 'AFTER_START' && (!Number.isInteger(parsed.days) || parsed.days < 0 || parsed.days > 3650)) fail('Plazo de cuota inválido');
      }
      return parsed;
    });
    unique(installments);
    return { scenarioId: plan.scenarioId ? text(plan.scenarioId, 100) : null, mode: plan.mode, installments };
  });
  if (new Set(paymentPlans.map(plan => plan.scenarioId)).size !== paymentPlans.length) fail('Plan de pagos duplicado');
  if (totalsByScenario) {
    if (paymentPlans.some(plan => plan.scenarioId && !totalsByScenario.some(scenario => scenario.id === plan.scenarioId))) fail('El plan pertenece a un escenario inexistente');
    if (issue && paymentPlans.length) for (const scenario of totalsByScenario) {
      const plan = paymentPlanForScenario({ paymentPlans }, scenario.id);
      if (!plan) fail('Falta un plan de pagos para un escenario');
      calculateProposalPayments(plan, scenario.totals);
    }
  }
  if (issue && paymentPlans.length && value.paymentTermsConfirmed !== true) fail('Confirma que las condiciones son compatibles con el plan de pagos');
  return {
    version: 1, title: text(value.title), execution: normalizeExecution(value.execution), phases,
    ...Object.fromEntries(['introductionHtml', 'referencesHtml', 'bonusHtml', 'exclusionsHtml'].map(key => [key, sanitizeProposalHtml(value[key])])),
    paymentPlans, paymentTermsConfirmed: value.paymentTermsConfirmed === true
  };
};
