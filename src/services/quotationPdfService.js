import { readFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import { parseContractTermsText } from './quotationContractTerms.js';

const PAGE = { width: 210, height: 297, left: 18, right: 18, top: 18, bottom: 20 };
const CONTENT_WIDTH = PAGE.width - PAGE.left - PAGE.right;
export const PDF_LAYOUT = {
  serviceDescriptionWidth: 112,
  rightEdge: PAGE.width - PAGE.right
};
const COLORS = {
  ink: [24, 24, 27],
  muted: [82, 82, 91],
  subtle: [161, 161, 170],
  border: [228, 228, 231],
  surface: [250, 250, 250],
  brand: [0, 133, 156],
  brandSoft: [232, 247, 249],
  white: [255, 255, 255]
};

let cachedFonts;

const getFonts = () => {
  if (!cachedFonts) {
    cachedFonts = {
      regular: readFileSync(new URL('../assets/fonts/WorkSans-Regular.ttf', import.meta.url)).toString('base64'),
      bold: readFileSync(new URL('../assets/fonts/WorkSans-Bold.ttf', import.meta.url)).toString('base64')
    };
  }
  return cachedFonts;
};

const registerFonts = (doc) => {
  const fonts = getFonts();
  doc.addFileToVFS('WorkSans-Regular.ttf', fonts.regular);
  doc.addFont('WorkSans-Regular.ttf', 'WorkSans', 'normal');
  doc.addFileToVFS('WorkSans-Bold.ttf', fonts.bold);
  doc.addFont('WorkSans-Bold.ttf', 'WorkSans', 'bold');
  doc.setFont('WorkSans', 'normal');
};

const moneyFormatter = (currency) => new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency,
  minimumFractionDigits: currency === 'USD' ? 2 : 0,
  maximumFractionDigits: currency === 'USD' ? 2 : 0
});

const formatDate = (value) => value
  ? new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Bogota' }).format(new Date(value))
  : 'No definida';

const addPage = (doc) => {
  doc.addPage();
  doc.setFillColor(...COLORS.brand);
  doc.rect(0, 0, PAGE.width, 2, 'F');
  return PAGE.top;
};

const ensureSpace = (doc, y, needed) => (
  y + needed > PAGE.height - PAGE.bottom ? addPage(doc) : y
);

const setText = (doc, { size = 10, style = 'normal', color = COLORS.ink } = {}) => {
  doc.setFont('WorkSans', style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
};

const splitTerms = parseContractTermsText;

const groupScenarios = (items = []) => {
  const grouped = new Map();
  items.forEach((item) => {
    if (!item?.scenarioId) return;
    if (!grouped.has(item.scenarioId)) grouped.set(item.scenarioId, {
      id: item.scenarioId, name: item.scenarioName || 'Escenario', description: item.scenarioDescription || '',
      externalBudget: item.scenarioExternalBudget, externalBudgetNote: item.scenarioExternalBudgetNote || '',
      order: Number(item.scenarioOrder) || 0, selected: Boolean(item.selectedScenario), items: []
    });
    grouped.get(item.scenarioId).items.push(item);
  });
  return [...grouped.values()].sort((a, b) => a.order - b.order);
};

export const splitTermColumns = (terms = []) => {
  const firstColumnCount = Math.floor(terms.length / 2);
  return [terms.slice(0, firstColumnCount), terms.slice(firstColumnCount)];
};

export const splitServiceTime = (description = '') => {
  const normalized = String(description).replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^(.*?)(?:\s*)Tiempo de servicio\s*:\s*(.+)$/i);
  if (!match) return { body: normalized, serviceTime: '' };
  return { body: match[1].trim(), serviceTime: match[2].trim() };
};

const drawSectionHeading = (doc, y, eyebrow, title) => {
  setText(doc, { size: 8, style: 'bold', color: COLORS.brand });
  doc.text(eyebrow.toUpperCase(), PAGE.left, y);
  setText(doc, { size: 17, style: 'bold' });
  doc.text(title, PAGE.left, y + 8);
  return y + 17;
};

const drawService = (doc, item, index, y, formatMoney) => {
  const { body: description, serviceTime } = splitServiceTime(item.description);
  const note = String(item.note || '').trim();
  setText(doc, { size: 8.1, color: COLORS.muted });
  const descriptionLines = description ? doc.splitTextToSize(description, PDF_LAYOUT.serviceDescriptionWidth) : [];
  const serviceTimeLabel = 'Tiempo de servicio:';
  setText(doc, { size: 8.1, style: 'bold', color: COLORS.muted });
  const serviceTimeLabelWidth = doc.getTextWidth(serviceTimeLabel);
  setText(doc, { size: 8.1, color: COLORS.muted });
  const serviceTimeLines = serviceTime
    ? doc.splitTextToSize(serviceTime, PDF_LAYOUT.serviceDescriptionWidth - serviceTimeLabelWidth - 1.5)
    : [];
  setText(doc, { size: 8.5, color: COLORS.muted });
  const noteLines = note ? doc.splitTextToSize(note, CONTENT_WIDTH - 12) : [];
  const descriptionLineCount = descriptionLines.length + serviceTimeLines.length;
  const cardHeight = Math.max(25, 17 + descriptionLineCount * 4.1);
  const noteHeight = note ? 12 + noteLines.length * 4.8 : 0;
  y = ensureSpace(doc, y, cardHeight + noteHeight + 7);

  doc.setFillColor(...COLORS.white);
  doc.setDrawColor(...COLORS.border);
  doc.roundedRect(PAGE.left, y, CONTENT_WIDTH, cardHeight, 2, 2, 'FD');
  doc.setFillColor(...COLORS.surface);
  doc.roundedRect(PAGE.left + 5, y + 6, 9, 9, 1.5, 1.5, 'F');
  setText(doc, { size: 8, style: 'bold', color: COLORS.muted });
  doc.text(String(index + 1), PAGE.left + 9.5, y + 12.2, { align: 'center' });

  setText(doc, { size: 11, style: 'bold' });
  doc.text(String(item.name || 'Servicio'), PAGE.left + 19, y + 11);
  if (descriptionLines.length) {
    setText(doc, { size: 8.1, color: COLORS.muted });
    doc.text(descriptionLines, PAGE.left + 19, y + 17.5, { lineHeightFactor: 1.22 });
  }
  if (serviceTimeLines.length) {
    const serviceTimeY = y + 17.5 + descriptionLines.length * 3.5;
    setText(doc, { size: 8.1, style: 'bold', color: COLORS.muted });
    doc.text(serviceTimeLabel, PAGE.left + 19, serviceTimeY);
    setText(doc, { size: 8.1, color: COLORS.muted });
    doc.text(serviceTimeLines, PAGE.left + 20.5 + serviceTimeLabelWidth, serviceTimeY, { lineHeightFactor: 1.22 });
  }

  const quantity = Number(item.quantity || 0);
  setText(doc, { size: 7.5, style: 'bold', color: COLORS.subtle });
  doc.text(`${quantity} ${quantity === 1 ? 'UNIDAD' : 'UNIDADES'}`, PAGE.width - PAGE.right - 5, y + 9, { align: 'right' });
  setText(doc, { size: 12, style: 'bold' });
  doc.text(formatMoney.format(Number(item.price || 0) * quantity), PAGE.width - PAGE.right - 5, y + 17, { align: 'right' });

  y += cardHeight;
  if (note) {
    doc.setDrawColor(...COLORS.brand);
    doc.setLineWidth(0.7);
    doc.line(PAGE.left + 5, y + 4, PAGE.left + 5, y + noteHeight - 2);
    setText(doc, { size: 7.5, style: 'bold', color: COLORS.brand });
    doc.text('NOTA ADICIONAL', PAGE.left + 10, y + 7);
    setText(doc, { size: 8.5, color: COLORS.muted });
    doc.text(noteLines, PAGE.left + 10, y + 13, { lineHeightFactor: 1.35 });
    y += noteHeight;
  }
  return y + 6;
};

const drawTerms = (doc, terms, y) => {
  if (PAGE.height - PAGE.bottom - y < 120) y = addPage(doc);
  else y = ensureSpace(doc, y, 34);
  y = drawSectionHeading(doc, y, 'Información contractual', 'Términos y condiciones');
  const columnGap = 6;
  const columnWidth = (CONTENT_WIDTH - columnGap) / 2;
  const columnStarts = [PAGE.left, PAGE.left + columnWidth + columnGap];
  const preparedTerms = terms.map((term, index) => {
    setText(doc, { size: 7.2, color: COLORS.muted });
    const lines = doc.splitTextToSize(term, columnWidth - 10);
    const blockHeight = Math.max(8, lines.length * 3.75 + 3.5);
    return { lines, blockHeight, number: index + 1 };
  });
  const firstPageCapacity = PAGE.height - PAGE.bottom - y;
  const continuedPageCapacity = PAGE.height - PAGE.bottom - PAGE.top;
  const pages = [];
  let offset = 0;
  while (offset < preparedTerms.length) {
    const capacity = pages.length === 0 ? firstPageCapacity : continuedPageCapacity;
    let bestCount = 1;
    for (let count = 1; offset + count <= preparedTerms.length; count += 1) {
      const candidate = preparedTerms.slice(offset, offset + count);
      const [left, right] = splitTermColumns(candidate);
      const fits = [left, right].every((column) => (
        column.reduce((height, entry) => height + entry.blockHeight, 0) <= capacity
      ));
      if (!fits) break;
      bestCount = count;
    }
    pages.push(splitTermColumns(preparedTerms.slice(offset, offset + bestCount)));
    offset += bestCount;
  }
  if (pages.length > 1) {
    const lastIndex = pages.length - 1;
    const previousEntries = pages[lastIndex - 1].flat();
    const lastEntries = pages[lastIndex].flat();
    const columnHeight = (column) => column.reduce((height, entry) => height + entry.blockHeight, 0);
    for (let moveCount = 1; lastEntries.length + moveCount <= 4 && moveCount < previousEntries.length; moveCount += 1) {
      const previousCandidate = splitTermColumns(previousEntries.slice(0, -moveCount));
      const lastCandidate = splitTermColumns([...previousEntries.slice(-moveCount), ...lastEntries]);
      const previousCapacity = lastIndex - 1 === 0 ? firstPageCapacity : continuedPageCapacity;
      const previousFits = previousCandidate.every((column) => columnHeight(column) <= previousCapacity);
      const lastFits = lastCandidate.every((column) => columnHeight(column) <= continuedPageCapacity);
      if (lastEntries.length + moveCount === 4 && previousFits && lastFits) {
        pages[lastIndex - 1] = previousCandidate;
        pages[lastIndex] = lastCandidate;
        break;
      }
    }
  }

  pages.forEach((pageColumns, pageIndex) => {
    if (pageIndex > 0) addPage(doc);
    const pageY = pageIndex === 0 ? y : PAGE.top;
    pageColumns.forEach((entries, column) => {
      let columnY = pageY;
      const x = columnStarts[column];
      entries.forEach(({ lines, blockHeight, number }) => {
        doc.setFillColor(...COLORS.brandSoft);
        doc.roundedRect(x, columnY, 6.5, 6.5, 1.3, 1.3, 'F');
        setText(doc, { size: 6.5, style: 'bold', color: COLORS.brand });
        doc.text(String(number), x + 3.25, columnY + 4.45, { align: 'center' });
        setText(doc, { size: 7.2, color: COLORS.muted });
        doc.text(lines, x + 9, columnY + 3.4, { lineHeightFactor: 1.22 });
        columnY += blockHeight;
      });
    });
  });
};

const drawFooters = (doc, issuer) => {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...COLORS.border);
    doc.line(PAGE.left, PAGE.height - 13, PAGE.width - PAGE.right, PAGE.height - 13);
    setText(doc, { size: 7.5, color: COLORS.subtle });
    doc.text(`${issuer.email || ''}  ·  ${issuer.whatsapp || ''}`, PAGE.left, PAGE.height - 7);
    doc.text(`${page} / ${pages}`, PAGE.width - PAGE.right, PAGE.height - 7, { align: 'right' });
  }
};

export const generateQuotationPdfBuffer = (quotation, issuer) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  registerFonts(doc);
  const formatMoney = moneyFormatter(quotation.currency || 'COP');
  const consecutive = `COT-${String(quotation.consecutive).padStart(4, '0')}`;
  const isBrain = quotation.emisor_type === 'BRAIN_STUDIO';

  doc.setProperties({
    title: `Propuesta comercial ${consecutive}`,
    author: isBrain ? 'Brainstudio' : issuer.nombre,
    subject: `Cotización para ${quotation.client_company || quotation.client_name}`
  });
  doc.setFillColor(...COLORS.brand);
  doc.rect(0, 0, PAGE.width, 36, 'F');

  let y = 16;
  setText(doc, { size: 15, style: 'bold', color: COLORS.white });
  doc.text(isBrain ? 'Brainstudio' : issuer.nombre, PAGE.left, y);
  setText(doc, { size: 8, color: [213, 241, 245] });
  const identity = isBrain ? `${issuer.razonSocial} · NIT ${issuer.nit}` : issuer.identificacion;
  doc.text(identity || '', PAGE.left, y + 5);
  setText(doc, { size: 8, style: 'bold', color: [213, 241, 245] });
  doc.text('PROPUESTA', PAGE.width - PAGE.right, y - 1, { align: 'right' });
  setText(doc, { size: 11, style: 'bold', color: COLORS.white });
  doc.text(consecutive, PAGE.width - PAGE.right, y + 5, { align: 'right' });

  y = 51;
  doc.setFillColor(...COLORS.brandSoft);
  doc.roundedRect(PAGE.left, y, 42, 8, 1.5, 1.5, 'F');
  setText(doc, { size: 7.5, style: 'bold', color: COLORS.brand });
  doc.text('PROPUESTA COMERCIAL', PAGE.left + 21, y + 5.3, { align: 'center' });
  y += 18;
  setText(doc, { size: 25, style: 'bold' });
  doc.text(String(quotation.client_company || quotation.client_name), PAGE.left, y);
  setText(doc, { size: 10, color: COLORS.muted });
  const intro = doc.splitTextToSize('Reunimos los servicios, alcances e inversión necesarios para avanzar con claridad hacia los objetivos acordados.', 118);
  doc.text(intro, PAGE.left, y + 9, { lineHeightFactor: 1.4 });
  setText(doc, { size: 7.5, style: 'bold', color: COLORS.subtle });
  doc.text('EMISIÓN', PDF_LAYOUT.rightEdge, y - 2, { align: 'right' });
  doc.text('VIGENCIA', PDF_LAYOUT.rightEdge, y + 13, { align: 'right' });
  setText(doc, { size: 8.5, style: 'bold' });
  doc.text(formatDate(quotation.created_at), PDF_LAYOUT.rightEdge, y + 4, { align: 'right' });
  doc.text(formatDate(quotation.expires_at), PDF_LAYOUT.rightEdge, y + 19, { align: 'right' });

  y += 42;
  const allScenarios = groupScenarios(quotation.items || []);
  const selectedScenario = allScenarios.find(({ selected }) => selected);
  const scenarios = selectedScenario ? [selectedScenario] : allScenarios;
  y = drawSectionHeading(doc, y, 'Alcance', scenarios.length ? (selectedScenario ? 'Escenario seleccionado' : 'Escenarios disponibles') : 'Servicios incluidos');
  if (scenarios.length) {
    scenarios.forEach((scenario, scenarioIndex) => {
      y = ensureSpace(doc, y, 30);
      setText(doc, { size: 8, style: 'bold', color: COLORS.brand });
      doc.text(`OPCIÓN ${scenarioIndex + 1}`, PAGE.left, y);
      setText(doc, { size: 15, style: 'bold' });
      doc.text(scenario.name, PAGE.left, y + 7);
      if (scenario.description) {
        setText(doc, { size: 8.2, color: COLORS.muted });
        const lines = doc.splitTextToSize(scenario.description, CONTENT_WIDTH);
        doc.text(lines, PAGE.left, y + 13, { lineHeightFactor: 1.25 });
        y += lines.length * 3.7;
      }
      y += 18;
      scenario.items.forEach((item, index) => { y = drawService(doc, item, index, y, formatMoney); });
      const subtotal = scenario.items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
      const total = quotation.currency !== 'USD' && !quotation.is_tax_exempt ? subtotal * 1.19 : subtotal;
      y = ensureSpace(doc, y, scenario.externalBudget !== null && scenario.externalBudget !== undefined ? 26 : 15);
      setText(doc, { size: 8, style: 'bold', color: COLORS.brand });
      doc.text('VALOR DE ESTA OPCIÓN', PAGE.left, y);
      setText(doc, { size: 14, style: 'bold' });
      doc.text(formatMoney.format(total), PDF_LAYOUT.rightEdge, y, { align: 'right' });
      y += 8;
      if (scenario.externalBudget !== null && scenario.externalBudget !== undefined) {
        setText(doc, { size: 8, style: 'bold', color: COLORS.muted });
        doc.text(`Presupuesto externo: ${formatMoney.format(Number(scenario.externalBudget))}`, PAGE.left, y);
        if (scenario.externalBudgetNote) {
          setText(doc, { size: 7.5, color: COLORS.muted });
          doc.text(doc.splitTextToSize(scenario.externalBudgetNote, CONTENT_WIDTH - 45), PAGE.left + 45, y);
        }
        y += 10;
      }
      y += 7;
    });
  } else {
    (quotation.items || []).forEach((item, index) => { y = drawService(doc, item, index, y, formatMoney); });
  }

  const hasPendingScenarioSelection = scenarios.length > 0 && !selectedScenario;
  if (!hasPendingScenarioSelection) {
    y = ensureSpace(doc, y, 58);
    setText(doc, { size: 7.5, style: 'bold', color: COLORS.subtle });
    doc.text('CLIENTE', PAGE.left, y + 4);
    setText(doc, { size: 11, style: 'bold' });
    doc.text(String(quotation.client_company || quotation.client_name), PAGE.left, y + 11);
    if (quotation.client_company) {
      setText(doc, { size: 8.5, color: COLORS.muted });
      doc.text(`Atención: ${quotation.client_name}`, PAGE.left, y + 17);
    }
    setText(doc, { size: 8.5, color: COLORS.muted });
    doc.text(String(quotation.client_email || 'No proporcionado'), PAGE.left, y + 25);
    doc.text(String(quotation.client_phone || 'No proporcionado'), PAGE.left, y + 31);

    doc.setFillColor(...COLORS.brand);
    doc.roundedRect(105, y, 87, 48, 2, 2, 'F');
    setText(doc, { size: 8, style: 'bold', color: [221, 214, 254] });
    doc.text('INVERSIÓN TOTAL', 112, y + 9);
    setText(doc, { size: 21, style: 'bold', color: COLORS.white });
    doc.text(formatMoney.format(Number(quotation.total_amount || 0)), 112, y + 21);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.2);
    doc.line(112, y + 27, 185, y + 27);
    setText(doc, { size: 8, color: [237, 233, 254] });
    doc.text('Subtotal', 112, y + 35);
    doc.text(formatMoney.format(Number(quotation.subtotal || 0)), 185, y + 35, { align: 'right' });
    if (quotation.currency !== 'USD' && !quotation.is_tax_exempt) {
      doc.text('IVA (19%)', 112, y + 42);
      doc.text(formatMoney.format(Number(quotation.tax_amount || 0)), 185, y + 42, { align: 'right' });
    }
  }

  drawTerms(doc, splitTerms(quotation.terms_and_conditions), y + (hasPendingScenarioSelection ? 7 : 62));
  drawFooters(doc, issuer);
  return Buffer.from(doc.output('arraybuffer'));
};

export { splitTerms };
