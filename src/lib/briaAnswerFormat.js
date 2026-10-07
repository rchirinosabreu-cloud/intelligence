// La respuesta de Bria llega como texto corrido con viñetas y alguna negrita de markdown. La pantalla la
// pinta en párrafos y listas sin un intérprete de markdown: lo justo para que se lea bien y nada más.

const BULLET = /^(?:[-*•]|\d+[.)])\s+(.*)$/;

const clean = (line) => line
  .replace(/^#+\s*/, '')
  .replace(/\*\*(.+?)\*\*/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .trim();

/** «Texto con\n- viñetas» → [{ type: 'p', text }, { type: 'ul', items }]. */
export const answerBlocks = (text) => {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [];
  let list = null;
  const flushParagraph = () => { if (paragraph.length) { blocks.push({ type: 'p', text: paragraph.join(' ') }); paragraph = []; } };
  const flushList = () => { if (list) { blocks.push(list); list = null; } };
  for (const raw of lines) {
    const line = raw.trim();
    const bullet = line.match(BULLET);
    if (bullet) {
      flushParagraph();
      list = list || { type: 'ul', items: [] };
      list.items.push(clean(bullet[1]));
      continue;
    }
    flushList();
    if (!line) { flushParagraph(); continue; }
    paragraph.push(clean(line));
  }
  flushParagraph();
  flushList();
  return blocks;
};
