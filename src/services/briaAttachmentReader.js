import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { unzipSync } from 'fflate';
import mammoth from 'mammoth';
import XLSX from 'xlsx';
import sharp from 'sharp';
import { PDFParse } from 'pdf-parse';
import { validateAttachmentSelection, attachmentError } from '../lib/briaAttachments.js';

const MAX_TEXT = 40000, MAX_EXPANDED = 40 * 1024 * 1024;
const checkZip = bytes => {
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || bytes.readUInt32LE(end) !== 0x06054b50) throw attachmentError('El archivo Office no se pudo abrir.');
  const count = bytes.readUInt16LE(end + 10), offset = bytes.readUInt32LE(end + 16);
  if (count > 5000 || offset >= bytes.length) throw attachmentError('El archivo Office es demasiado complejo.');
  let cursor = offset, total = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) throw attachmentError('El archivo Office está incompleto.');
    total += bytes.readUInt32LE(cursor + 24);
    if (total > MAX_EXPANDED) throw attachmentError('El archivo Office expandido supera 40 MB.');
    cursor += 46 + bytes.readUInt16LE(cursor + 28) + bytes.readUInt16LE(cursor + 30) + bytes.readUInt16LE(cursor + 32);
  }
};
const xmlText = value => value.replace(/<[^>]*>/g, '').replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => String.fromCodePoint(n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n))).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
export const attachmentModelPart = file => file.status === 'IMAGE' ? { type: 'input_image', image_url: `data:image/jpeg;base64,${file.analysisData.toString('base64')}`, detail: 'auto' } : file.status === 'PDF' ? { type: 'input_file', filename: file.name, file_data: `data:application/pdf;base64,${file.buffer.toString('base64')}` } : null;
export const readBriaAttachment = async file => {
  validateAttachmentSelection([file]);
  const bytes = Buffer.from(file.buffer), name = path.basename(String(file.originalname || file.name || 'archivo').replace(/\\/g, '/')).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 180) || 'archivo';
  const extension = path.extname(name).toLowerCase();
  let text = '', status = 'READ', warning = null, analysisData = null, mime = 'application/octet-stream';
  if (['.docx', '.pptx', '.xlsx', '.ods'].includes(extension)) checkZip(bytes);
  try {
    const isImage = bytes.subarray(0, 3).equals(Buffer.from([255,216,255])) || bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || /^GIF8/.test(bytes.subarray(0,4).toString()) || (bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP');
    if (isImage) { analysisData = await sharp(bytes, { limitInputPixels: 25000000 }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).flatten({ background: 'white' }).jpeg({ quality: 85 }).toBuffer(); status = 'IMAGE'; mime = 'image/jpeg'; }
    else if (extension === '.pdf' && bytes.subarray(0,5).toString() === '%PDF-') {
      mime = 'application/pdf'; const parser = new PDFParse({ data: bytes });
      try { const result = await parser.getText(); text = result.text; status = 'PDF'; } finally { await parser.destroy(); }
    } else if (extension === '.docx') text = (await mammoth.extractRawText({ buffer: bytes })).value;
    else if (['.xlsx', '.xls', '.csv', '.tsv', '.ods'].includes(extension)) {
      const book = XLSX.read(bytes, { type: 'buffer', sheetRows: 2000 });
      text = book.SheetNames.map(sheet => `Hoja: ${sheet}\n${XLSX.utils.sheet_to_csv(book.Sheets[sheet])}`).join('\n\n');
      warning = 'Lectura de hasta 2.000 filas por hoja; comprueba el alcance antes de usar totales.';
    } else if (extension === '.pptx') {
      const entries = unzipSync(bytes, { filter: entry => /^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/.test(entry.name) });
      text = Object.entries(entries).sort(([a],[b]) => a.localeCompare(b, undefined, { numeric: true })).map(([key, value]) => `${key}\n${[...Buffer.from(value).toString().matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map(match => xmlText(match[1])).join('\n')}`).join('\n\n');
    } else if (['.txt', '.md', '.json', '.xml', '.html', '.rtf', '.log'].includes(extension)) text = bytes.subarray(0,2).equals(Buffer.from([255,254])) ? bytes.subarray(2).toString('utf16le') : bytes.toString('utf8');
    else { status = 'UNREADABLE'; warning = 'Archivo conservado; Bria no puede interpretar este formato. Puedes convertirlo a PDF, DOCX, XLSX o PPTX.'; }
  } catch (failure) { console.error('[BriaAttachment]', failure.code || failure.name); status = 'UNREADABLE'; warning = 'Archivo conservado; no se pudo leer su contenido. Puede estar protegido, dañado o usar un formato distinto.'; }
  if (/(?:password|contrase(?:ña|na)|api[_ -]?key|refresh[_ -]?token|client[_ -]?secret)\s*[:=]\s*\S+|\bsk-[a-zA-Z0-9_-]{12,}|-----BEGIN .*PRIVATE KEY-----/i.test(text)) throw attachmentError('El archivo contiene credenciales. Retíralas antes de adjuntarlo.');
  if (text.length > MAX_TEXT) warning = `Lectura parcial: primeros ${MAX_TEXT.toLocaleString('es-CO')} caracteres. ${warning || ''}`.trim();
  return { id: randomUUID(), name, size: bytes.length, buffer: bytes, mime, text: text.slice(0, MAX_TEXT).toWellFormed().replace(/\0/g, ''), status, warning, analysisData };
};
