import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { proposalRichTextBlocks, sanitizeProposalHtml } from '../src/services/quotationProposalDetails.js';
import { normalizeChatContent } from '../src/services/teamChatContent.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Rodny, 23 de noviembre de 2026: «el formato está dando problemas en todas partes en donde se usa, las viñetas
// generan problemas, el resaltado no sirve». Lo que la barra del editor ofrece tiene que sobrevivir al guardar.
test('a proposal keeps highlight and the number a list continues from', () => {
  const html = '<p>Con <mark>resaltado</mark></p><ol start="3"><li><p>Tercero</p></li><li><p>Cuarto</p></li></ol>';
  assert.equal(sanitizeProposalHtml(html), html);
  assert.equal(sanitizeProposalHtml('<ol start="-4" onclick="x()"><li><p>Uno</p></li></ol><p start="3">x</p>'), '<ol><li><p>Uno</p></li></ol><p>x</p>');
  const blocks = proposalRichTextBlocks(html);
  assert.deepEqual(blocks[0].runs, [{ text: 'Con ' }, { text: 'resaltado', highlight: true }]);
  assert.deepEqual(blocks.slice(1).map(block => block.ordinal), [3, 4]);
});

test('nested bullets keep their level and a second paragraph does not repeat the bullet', () => {
  const blocks = proposalRichTextBlocks('<ul><li><p>Uno</p><ul><li><p>Dentro</p></li></ul></li><li><p>Dos</p><p>Sigue</p></li></ul><p>Fuera</p>');
  assert.deepEqual(blocks.map(({ runs, ...rest }) => ({ text: runs[0].text, ...rest })), [
    { text: 'Uno', bullet: true },
    { text: 'Dentro', bullet: true, level: 1 },
    { text: 'Dos', bullet: true },
    { text: 'Sigue', bullet: true, continuation: true },
    { text: 'Fuera' }
  ]);
});

test('every place that stores editor text accepts what the toolbar offers', async () => {
  const [tasks, announcements, dashboard, comments, receivable] = await Promise.all([
    read('src/controllers/taskController.js'), read('src/services/announcementDeliveryService.js'),
    read('src/services/personalDashboardService.js'), read('src/components/ui/RichCommentContent.jsx'),
    read('src/services/receivableDocumentService.js')
  ]);
  for (const source of [tasks, announcements, dashboard, comments]) {
    const tags = source.match(/ALLOWED_TAGS[^\]]*\]/)[0];
    for (const tag of ['h1', 'h2', 'h3', 'mark', 'ul', 'ol', 'li', 'strong', 'em', 'u']) assert.match(tags, new RegExp(`'${tag}'`));
    assert.match(source, /ALLOWED_ATTR[^\]]*'start'/);
  }
  assert.match(receivable, /ALLOWED_ATTR: \['start'\]/);
  const chat = normalizeChatContent('<p><mark>a</mark></p><ol start="2"><li><p>b</p></li></ol>', 'HTML');
  assert.match(JSON.stringify(chat), /<mark>a<\/mark>[\s\S]*<ol start=\\"2\\">/);
});

test('the editor wraps whole words and every reader draws the highlight', async () => {
  const [editor, content, pdf, chatCss] = await Promise.all([
    read('src/components/ui/RichTextEditor.jsx'), read('src/components/modules/Quotations/ProposalContent.jsx'),
    read('src/services/quotationPdfService.js'), read('src/components/chat/teamChat.css')
  ]);
  assert.doesNotMatch(editor, /\]:break-all/);
  assert.match(editor, /overflow-wrap:anywhere/);
  assert.match(content, /run\.highlight/);
  assert.match(pdf, /run\.highlight/);
  assert.match(chatCss, /chat-rich-text mark/);
  assert.match(chatCss, /chat-rich-text h3/);
});
