import { readFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import { parseContractTermsText } from './quotationContractTerms.js';
import { calculateQuotationTotals, groupQuotationScenarios } from './quotationDomainService.js';

const PAGE = { width: 210, height: 297, left: 18, right: 18, top: 18, bottom: 20 };
const CONTENT_WIDTH = PAGE.width - PAGE.left - PAGE.right;
export const PDF_LAYOUT = {
  serviceDescriptionWidth: 112,
  serviceTitleWidth: 94,
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
  discount: [4, 120, 87],
  discountSoft: [220, 252, 231],
  white: [255, 255, 255]
};

let cachedFonts;
let cachedBrainstudioWordmark;

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

const getBrainstudioWordmark = () => {
  if (!cachedBrainstudioWordmark) {
    cachedBrainstudioWordmark = `data:image/png;base64,${readFileSync(
      new URL('../../public/brainstudio-wordmark-white.png', import.meta.url)
    ).toString('base64')}`;
  }
  return cachedBrainstudioWordmark;
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

export const limitServiceTitleLines = (lines = [], maxLines = 2) => {
  const normalized = lines.map((line) => String(line));
  if (normalized.length <= maxLines) return normalized;
  const visible = normalized.slice(0, maxLines);
  visible[maxLines - 1] = `${visible[maxLines - 1].replace(/[.…]+$/u, '').trimEnd()}…`;
  return visible;
};

export const getServiceTextLayout = (y, titleLineCount = 1) => {
  const extraTitleHeight = Math.max(0, titleLineCount - 1) * 5;
  return {
    descriptionY: y + 17.5 + extraTitleHeight,
    extraTitleHeight
  };
};

export const calculateServiceCardHeight = ({
  titleLineCount = 1,
  descriptionLineCount = 0
} = {}) => {
  const extraTitleHeight = Math.max(0, titleLineCount - 1) * 5;
  const renderedDescriptionHeight = descriptionLineCount > 0
    ? 22 + (descriptionLineCount - 1) * 3.5
    : 0;
  return Math.max(25 + extraTitleHeight, renderedDescriptionHeight + extraTitleHeight);
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
  setText(doc, { size: 11, style: 'bold' });
  const titleLines = limitServiceTitleLines(
    doc.splitTextToSize(String(item.name || 'Servicio'), PDF_LAYOUT.serviceTitleWidth)
  );
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
  const cardHeight = calculateServiceCardHeight({
    titleLineCount: titleLines.length,
    descriptionLineCount
  });
  const noteHeight = note ? 12 + noteLines.length * 4.8 : 0;
  y = ensureSpace(doc, y, cardHeight + noteHeight + 7);
  const { descriptionY } = getServiceTextLayout(y, titleLines.length);

  doc.setFillColor(...COLORS.white);
  doc.setDrawColor(...COLORS.border);
  doc.roundedRect(PAGE.left, y, CONTENT_WIDTH, cardHeight, 2, 2, 'FD');
  doc.setFillColor(...COLORS.surface);
  doc.roundedRect(PAGE.left + 5, y + 6, 9, 9, 1.5, 1.5, 'F');
  setText(doc, { size: 8, style: 'bold', color: COLORS.muted });
  doc.text(String(index + 1), PAGE.left + 9.5, y + 12.2, { align: 'center' });

  setText(doc, { size: 11, style: 'bold' });
  doc.text(titleLines, PAGE.left + 19, y + 11, { lineHeightFactor: 1.12 });
  if (descriptionLines.length) {
    setText(doc, { size: 8.1, color: COLORS.muted });
    doc.text(descriptionLines, PAGE.left + 19, descriptionY, { lineHeightFactor: 1.22 });
  }
  if (serviceTimeLines.length) {
    const serviceTimeY = descriptionY + descriptionLines.length * 3.5;
    setText(doc, { size: 8.1, style: 'bold', color: COLORS.muted });
    doc.text(serviceTimeLabel, PAGE.left + 19, serviceTimeY);
    setText(doc, { size: 8.1, color: COLORS.muted });
    doc.text(serviceTimeLines, PAGE.left + 20.5 + serviceTimeLabelWidth, serviceTimeY, { lineHeightFactor: 1.22 });
  }

  const quantity = Number(item.quantity || 0);
  setText(doc, { size: 7.5, style: 'bold', color: COLORS.subtle });
  const billingLabel = item.billingType === 'ONE_TIME' ? 'PAGO ÚNICO' : 'MENSUAL';
  doc.text(`${quantity} ${quantity === 1 ? 'UNIDAD' : 'UNIDADES'} · ${billingLabel}`, PAGE.width - PAGE.right - 5, y + 9, { align: 'right' });
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
  if (isBrain) {
    doc.addImage(getBrainstudioWordmark(), 'PNG', PAGE.left, 5.5, 66, 19.8, undefined, 'FAST');
  } else {
    setText(doc, { size: 15, style: 'bold', color: COLORS.white });
    doc.text(issuer.nombre, PAGE.left, y);
  }
  setText(doc, { size: 8, color: [213, 241, 245] });
  const identity = isBrain ? `${issuer.razonSocial} · NIT ${issuer.nit}` : issuer.identificacion;
  doc.text(identity || '', PAGE.left, isBrain ? 31 : y + 5);
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
  const allScenarios = groupQuotationScenarios(quotation.items || []);
  const selectedScenario = allScenarios.find(({ selected }) => selected);
  const scenarios = selectedScenario ? [selectedScenario] : allScenarios;
  y = drawSectionHeading(doc, y, 'Alcance', scenarios.length ? (selectedScenario ? 'Escenario seleccionado' : 'Escenarios disponibles') : 'Servicios incluidos');
  if (scenarios.length) {
    scenarios.forEach((scenario, scenarioIndex) => {
      y = scenarioIndex > 0 ? addPage(doc) : ensureSpace(doc, y, 30);
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
      const amounts = calculateQuotationTotals(scenario.items, quotation.is_tax_exempt || quotation.currency === 'USD', {
        durationMonths: quotation.duration_months || 1,
        discountType: scenario.discountType,
        discountValue: scenario.discountValue
      });
      const commercialLines = [
        { label: 'Inversión mensual', amount: amounts.monthlySubtotal },
        ...(amounts.durationMonths > 1 ? [{ label: `${amounts.durationMonths} meses × mensualidad`, amount: amounts.monthlySubtotal * amounts.durationMonths }] : []),
        ...(amounts.oneTimeSubtotal > 0 ? [{ label: 'Servicios de pago único', amount: amounts.oneTimeSubtotal }] : []),
        ...(amounts.discountAmount > 0 ? [{ label: scenario.discountLabel || 'Descuento', amount: -amounts.discountAmount, isDiscount: true }] : []),
        { label: 'Subtotal contractual', amount: amounts.subtotal },
        ...(quotation.currency !== 'USD' && !quotation.is_tax_exempt ? [{ label: 'IVA (19%)', amount: amounts.taxAmount }] : [])
      ];
      const summaryHeight = 13 + commercialLines.length * 5;
      y = ensureSpace(doc, y, summaryHeight + (scenario.externalBudget !== null && scenario.externalBudget !== undefined ? 18 : 5));
      setText(doc, { size: 8, style: 'bold', color: COLORS.brand });
      doc.text('VALOR DE ESTA OPCIÓN', PAGE.left, y);
      setText(doc, { size: 14, style: 'bold' });
      doc.text(formatMoney.format(amounts.totalAmount), PDF_LAYOUT.rightEdge, y, { align: 'right' });
      y += 7;
      commercialLines.forEach(({ label, amount, isDiscount }) => {
        if (isDiscount) {
          doc.setFillColor(...COLORS.discountSoft);
          doc.roundedRect(PAGE.left - 2, y - 3.7, CONTENT_WIDTH + 4, 5.2, 1, 1, 'F');
        }
        setText(doc, { size: 7.5, style: isDiscount ? 'bold' : 'normal', color: isDiscount ? COLORS.discount : COLORS.muted });
        doc.text(isDiscount ? `AHORRO · ${label}` : label, PAGE.left, y);
        doc.text(formatMoney.format(amount), PDF_LAYOUT.rightEdge, y, { align: 'right' });
        y += 5;
      });
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
    const summaryItems = selectedScenario ? selectedScenario.items : (quotation.items || []);
    const amounts = calculateQuotationTotals(summaryItems, quotation.is_tax_exempt || quotation.currency === 'USD', {
      durationMonths: quotation.duration_months || 1,
      discountType: quotation.discount_type,
      discountValue: quotation.discount_value
    });
    const summaryLines = [
      { label: 'Inversión mensual', amount: amounts.monthlySubtotal },
      ...(amounts.durationMonths > 1 ? [{ label: `${amounts.durationMonths} meses × mensualidad`, amount: amounts.monthlySubtotal * amounts.durationMonths }] : []),
      ...(amounts.oneTimeSubtotal > 0 ? [{ label: 'Servicios de pago único', amount: amounts.oneTimeSubtotal }] : []),
      ...(amounts.discountAmount > 0 ? [{ label: quotation.discount_label || 'Descuento', amount: -amounts.discountAmount, isDiscount: true }] : []),
      { label: 'Subtotal contractual', amount: amounts.subtotal },
      ...(quotation.currency !== 'USD' && !quotation.is_tax_exempt ? [{ label: 'IVA (19%)', amount: amounts.taxAmount }] : [])
    ];
    const investmentHeight = 32 + summaryLines.length * 5;
    y = ensureSpace(doc, y, investmentHeight + 12);
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
    doc.roundedRect(105, y, 87, investmentHeight, 2, 2, 'F');
    setText(doc, { size: 8, style: 'bold', color: [221, 214, 254] });
    doc.text('INVERSIÓN TOTAL', 112, y + 9);
    setText(doc, { size: 21, style: 'bold', color: COLORS.white });
    doc.text(formatMoney.format(amounts.totalAmount), 112, y + 21);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.2);
    doc.line(112, y + 27, 185, y + 27);
    let summaryY = y + 35;
    setText(doc, { size: 7.5, color: [237, 233, 254] });
    summaryLines.forEach(({ label, amount, isDiscount }) => {
      if (isDiscount) {
        doc.setFillColor(...COLORS.discount);
        doc.roundedRect(110, summaryY - 3.6, 77, 5.2, 1, 1, 'F');
        setText(doc, { size: 7.5, style: 'bold', color: COLORS.white });
      } else {
        setText(doc, { size: 7.5, color: [237, 233, 254] });
      }
      doc.text(isDiscount ? `AHORRO · ${label}` : label, 112, summaryY);
      doc.text(formatMoney.format(amount), 185, summaryY, { align: 'right' });
      summaryY += 5;
    });
  }

  const normalSummaryHeight = hasPendingScenarioSelection ? 0 : 32 + [
    1,
    Number(quotation.duration_months || 1) > 1 ? 1 : 0,
    (quotation.items || []).some((item) => item.billingType === 'ONE_TIME') ? 1 : 0,
    Number(quotation.discount_amount || 0) > 0 ? 1 : 0,
    1,
    quotation.currency !== 'USD' && !quotation.is_tax_exempt ? 1 : 0
  ].reduce((sum, value) => sum + value, 0) * 5;
  drawTerms(doc, splitTerms(quotation.terms_and_conditions), y + (hasPendingScenarioSelection ? 7 : normalSummaryHeight + 14));
  drawFooters(doc, issuer);
  return Buffer.from(doc.output('arraybuffer'));
};

export { splitTerms };
