import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  APPROVAL_CHANNELS, HAND_CHANNELS, CLIENT_APPROVAL_SINCE, normalizeClientApproval, approvalStamp, approvalLabel,
  missingApprovalNotice, scheduledWithoutApproval, channelLabel
} from '../src/lib/clientApproval.js';
import { schedulingNotices } from '../src/lib/socialPublishing.js';

// La aprobación por fuera del portal (Rodny, 19 y 20 de octubre de 2026): el cliente aprueba por WhatsApp en 13 de los
// 14 grupos, y hasta hoy la plataforma no guardaba quién, cuándo ni por dónde. Desde ahora toda aprobación deja marca.

const read = (file) => readFileSync(file, 'utf8');
const NOW = new Date('2026-10-20T15:30:00Z');
const KAMILA = { userId: 'u-kam', name: 'Kamila Del Toro' };

test('channels: the portal and the editor stamp themselves; a person marks WhatsApp, mail, a call or a meeting', () => {
  assert.deepEqual(APPROVAL_CHANNELS.map((c) => c.value), ['PORTAL', 'WHATSAPP', 'CORREO', 'LLAMADA', 'REUNION', 'EQUIPO']);
  assert.deepEqual(HAND_CHANNELS, ['WHATSAPP', 'CORREO', 'LLAMADA', 'REUNION']);
  assert.equal(channelLabel('WHATSAPP'), 'WhatsApp');
  assert.equal(CLIENT_APPROVAL_SINCE, '2026-10-21');
});

test('a stamp keeps the channel, the note, who noted it and when; anything else is refused with words', () => {
  assert.deepEqual(normalizeClientApproval({ channel: 'whatsapp', note: '  Gema aprobó las 4 piezas  ' }, { actor: KAMILA, now: NOW }), { channel: 'WHATSAPP', note: 'Gema aprobó las 4 piezas', byUserId: 'u-kam', byName: 'Kamila Del Toro', at: '2026-10-20T15:30:00.000Z' });
  assert.deepEqual(normalizeClientApproval({ canal: 'PORTAL' }, { now: NOW }), { channel: 'PORTAL', note: null, byUserId: null, byName: null, at: '2026-10-20T15:30:00.000Z' });
  assert.throws(() => normalizeClientApproval({ channel: 'telegrama' }), /por dónde aprobó el cliente/);
  assert.throws(() => normalizeClientApproval({ channel: 'CORREO', note: 'x'.repeat(301) }), /300 caracteres/);
});

test('changing the status decides the stamp: approve stamps, going back to the client clears, the rest leaves it alone', () => {
  assert.deepEqual(approvalStamp({ status: 'APROBADO' }, { fromClientReview: true, now: NOW }).clientApproval.channel, 'PORTAL');
  const byHand = approvalStamp({ status: 'APROBADO' }, { actor: KAMILA, now: NOW }).clientApproval;
  assert.deepEqual([byHand.channel, byHand.byName], ['EQUIPO', 'Kamila Del Toro']);
  assert.equal(approvalStamp({ status: 'APROBADO', clientApproval: { channel: 'LLAMADA', note: 'me llamó a las 9' } }, { actor: KAMILA, now: NOW }).clientApproval.channel, 'LLAMADA');
  for (const status of ['BORRADOR', 'EN_REVISION', 'DEVUELTO']) assert.deepEqual(approvalStamp({ status }), { clientApproval: null }, status);
  for (const status of ['EN_PRODUCCION', 'REALIZADO', 'PUBLICADO']) assert.deepEqual(approvalStamp({ status }), {}, `${status} keeps the approval it had`);
  assert.deepEqual(approvalStamp({ captionText: 'x' }), {}, 'editing the text is not a decision about the approval');
});

test('the label says where, when (Bogotá) and who noted it', () => {
  assert.equal(approvalLabel({ channel: 'WHATSAPP', at: '2026-10-21T03:30:00Z', byName: 'Kamila Del Toro' }), 'Aprobada por WhatsApp el 20 de octubre · anotó Kamila');
  assert.equal(approvalLabel({ channel: 'PORTAL', at: '2026-10-20T15:30:00Z' }), 'Aprobada en el portal el 20 de octubre');
  assert.equal(approvalLabel({ channel: 'EQUIPO', at: '2026-10-20T15:30:00Z', byName: 'Rodny Chirinos' }), 'Aprobada desde el editor el 20 de octubre · anotó Rodny');
  assert.equal(approvalLabel(null), null);
});

test('a new piece without a stamp is a notice when scheduling, never a block; an old one is not an alarm', () => {
  const fresh = { status: 'EN_PRODUCCION', createdAt: '2026-10-22T12:00:00Z', clientApproval: null, format: 'Post' };
  assert.match(missingApprovalNotice(fresh), /no tiene la aprobación del cliente marcada/);
  assert.equal(missingApprovalNotice({ ...fresh, clientApproval: { channel: 'WHATSAPP' } }), null);
  assert.equal(missingApprovalNotice({ ...fresh, createdAt: '2026-10-01T12:00:00Z' }), null, 'created before the stamp existed');
  assert.equal(missingApprovalNotice({ ...fresh, status: 'PUBLICADO' }), null);
  assert.equal(missingApprovalNotice({ ...fresh, createdAt: undefined }), null, 'without a creation date nothing is assumed');
  assert.match(schedulingNotices({ item: fresh, assets: [], platforms: ['INSTAGRAM'] }).join('\n'), /El cliente aprobó por/, 'the social panel says it without blocking');
  assert.deepEqual(schedulingNotices({ item: { ...fresh, clientApproval: { channel: 'PORTAL' } }, assets: [], platforms: ['INSTAGRAM'] }), []);
  const scheduled = scheduledWithoutApproval([{ ...fresh, id: 'a', publications: [{ status: 'SCHEDULED' }] }, { ...fresh, id: 'b', publications: [{ status: 'CANCELLED' }] }, { ...fresh, id: 'c', clientApproval: { channel: 'CORREO' }, publications: [{ status: 'SCHEDULED' }] }]);
  assert.deepEqual(scheduled.map((item) => item.id), ['a']);
});

test('the column is additive, the service stamps every path, the route and the catalog exist, and the editor offers the mark', () => {
  assert.match(read('prisma/schema.prisma'), /clientApproval\s+Json\?/);
  const script = read('scripts/ensure-content-client-approval-schema.js');
  assert.match(script, /ADD COLUMN IF NOT EXISTS "clientApproval" JSONB/);
  assert.doesNotMatch(script, /UPDATE |DELETE |DROP /);
  assert.match(read('package.json'), /ensure-content-client-approval-schema\.js/);
  const service = read('src/services/contentService.js');
  assert.match(service, /approvalStamp\(normalizedData, \{ fromClientReview, actor, now: new Date\(\) \}\)/, 'every status change goes through the stamp');
  assert.match(service, /export const recordClientApproval/);
  assert.match(service, /clientApproval: true/, 'the piece is read with its stamp');
  assert.match(read('src/routes/api/content.js'), /router\.post\('\/items\/:id\/client-approval'/);
  assert.match(read('src/routes/api/content.js'), /updateContentItem\(req\.params\.id, req\.body, \{ actor: /, 'the editor’s status change carries who moved it');
  assert.match(read('src/controllers/publicController.js'), /updateContentItem\(req\.params\.id, \{ status: 'APROBADO' \}, \{ fromClientReview: true \}\)/, 'the portal keeps its path and stamps PORTAL by itself');
  assert.match(read('src/lib/platformCatalog.js'), /'POST \/content\/items\/:id\/client-approval'/);
  const editor = read('src/components/modules/ContentPlanDetail.jsx');
  assert.match(editor, /El cliente aprobó por…/);
  assert.match(editor, /data-piece-client-approval/);
  assert.match(editor, /approvalLabel\(item\.clientApproval\)/);
  assert.match(editor, /api\/content\/items\/\$\{id\}\/client-approval/);
  assert.match(read('src/lib/briaPulse.js'), /PROGRAMADA_SIN_APROBACION/);
});
