import { readFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';

const PAGE = { width: 210, height: 297, left: 18, right: 18, top: 18, bottom: 20 };
const CONTENT_WIDTH = PAGE.width - PAGE.left - PAGE.right;
const COLORS = {
  ink: [24, 24, 27],
  muted: [82, 82, 91],
  subtle: [161, 161, 170],
  border: [228, 228, 231],
  surface: [250, 250, 250],
  violet: [109, 40, 217],
  violetSoft: [245, 243, 255],
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
  doc.setFillColor(...COLORS.violet);
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

const splitTerms = (value) => String(value || '')
  .split('\n')
  .map((line) => line.replace(/^[●•]\s*/, '').trim())
  .filter(Boolean);

const drawSectionHeading = (doc, y, eyebrow, title) => {
  setText(doc, { size: 8, style: 'bold', color: COLORS.violet });
  doc.text(eyebrow.toUpperCase(), PAGE.left, y);
  setText(doc, { size: 17, style: 'bold' });
  doc.text(title, PAGE.left, y + 8);
  return y + 17;
};

const drawService = (doc, item, index, y, formatMoney) => {
  const description = String(item.description || '').trim();
  const note = String(item.note || '').trim();
  const descriptionLines = description ? doc.splitTextToSize(description, 112) : [];
  const noteLines = note ? doc.splitTextToSize(note, CONTENT_WIDTH - 12) : [];
  const cardHeight = Math.max(27, 18 + descriptionLines.length * 4.8);
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
    setText(doc, { size: 9, color: COLORS.muted });
    doc.text(descriptionLines, PAGE.left + 19, y + 18, { lineHeightFactor: 1.35 });
  }

  const quantity = Number(item.quantity || 0);
  setText(doc, { size: 7.5, style: 'bold', color: COLORS.subtle });
  doc.text(`${quantity} ${quantity === 1 ? 'UNIDAD' : 'UNIDADES'}`, PAGE.width - PAGE.right - 5, y + 9, { align: 'right' });
  setText(doc, { size: 12, style: 'bold' });
  doc.text(formatMoney.format(Number(item.price || 0) * quantity), PAGE.width - PAGE.right - 5, y + 17, { align: 'right' });

  y += cardHeight;
  if (note) {
    doc.setDrawColor(...COLORS.violet);
    doc.setLineWidth(0.7);
    doc.line(PAGE.left + 5, y + 4, PAGE.left + 5, y + noteHeight - 2);
    setText(doc, { size: 7.5, style: 'bold', color: COLORS.violet });
    doc.text('NOTA ADICIONAL', PAGE.left + 10, y + 7);
    setText(doc, { size: 8.5, color: COLORS.muted });
    doc.text(noteLines, PAGE.left + 10, y + 13, { lineHeightFactor: 1.35 });
    y += noteHeight;
  }
  return y + 6;
};

const drawTerms = (doc, terms, y) => {
  y = ensureSpace(doc, y, 28);
  y = drawSectionHeading(doc, y, 'Información contractual', 'Términos y condiciones');

  terms.forEach((term, index) => {
    const lines = doc.splitTextToSize(term, CONTENT_WIDTH - 14);
    const blockHeight = Math.max(10, lines.length * 5 + 4);
    y = ensureSpace(doc, y, blockHeight);
    doc.setFillColor(...COLORS.violetSoft);
    doc.roundedRect(PAGE.left, y, 8, 8, 1.5, 1.5, 'F');
    setText(doc, { size: 7.5, style: 'bold', color: COLORS.violet });
    doc.text(String(index + 1), PAGE.left + 4, y + 5.5, { align: 'center' });
    setText(doc, { size: 9, color: COLORS.muted });
    doc.text(lines, PAGE.left + 13, y + 4, { lineHeightFactor: 1.4 });
    y += blockHeight;
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
  doc.setFillColor(...COLORS.violet);
  doc.rect(0, 0, PAGE.width, 2, 'F');

  let y = PAGE.top;
  setText(doc, { size: 15, style: 'bold' });
  doc.text(isBrain ? 'Brainstudio' : issuer.nombre, PAGE.left, y);
  setText(doc, { size: 8, color: COLORS.muted });
  const identity = isBrain ? `${issuer.razonSocial} · NIT ${issuer.nit}` : issuer.identificacion;
  doc.text(identity || '', PAGE.left, y + 5);
  setText(doc, { size: 8, style: 'bold', color: COLORS.violet });
  doc.text('PROPUESTA', PAGE.width - PAGE.right, y - 1, { align: 'right' });
  setText(doc, { size: 11, style: 'bold' });
  doc.text(consecutive, PAGE.width - PAGE.right, y + 5, { align: 'right' });

  y += 25;
  doc.setFillColor(...COLORS.violetSoft);
  doc.roundedRect(PAGE.left, y, 42, 8, 1.5, 1.5, 'F');
  setText(doc, { size: 7.5, style: 'bold', color: COLORS.violet });
  doc.text('PROPUESTA COMERCIAL', PAGE.left + 21, y + 5.3, { align: 'center' });
  y += 18;
  setText(doc, { size: 25, style: 'bold' });
  doc.text(String(quotation.client_company || quotation.client_name), PAGE.left, y);
  setText(doc, { size: 10, color: COLORS.muted });
  const intro = doc.splitTextToSize('Reunimos los servicios, alcances e inversión necesarios para avanzar con claridad hacia los objetivos acordados.', 118);
  doc.text(intro, PAGE.left, y + 9, { lineHeightFactor: 1.4 });
  setText(doc, { size: 7.5, style: 'bold', color: COLORS.subtle });
  doc.text('EMISIÓN', 162, y - 2);
  doc.text('VIGENCIA', 162, y + 13);
  setText(doc, { size: 8.5, style: 'bold' });
  doc.text(formatDate(quotation.created_at), 162, y + 4);
  doc.text(formatDate(quotation.expires_at), 162, y + 19);

  y += 42;
  y = drawSectionHeading(doc, y, 'Alcance', 'Servicios incluidos');
  (quotation.items || []).forEach((item, index) => {
    y = drawService(doc, item, index, y, formatMoney);
  });

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

  doc.setFillColor(...COLORS.violet);
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

  drawTerms(doc, splitTerms(quotation.terms_and_conditions), y + 62);
  drawFooters(doc, issuer);
  return Buffer.from(doc.output('arraybuffer'));
};

export { splitTerms };
