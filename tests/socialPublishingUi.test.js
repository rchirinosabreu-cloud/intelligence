import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Contract of the screens that expose social publishing (Rodny, 29 September 2026): the hour uses the
// platform clock, nothing publishes without an explicit «Programar», the token never reaches the browser.

const read = (path) => readFileSync(path, 'utf8');

test('the piece card takes the hour with BrainTimePicker and shows the publishing band', () => {
  const card = read('src/components/modules/ContentPlanDetail.jsx');
  assert.match(card, /import \{ BrainTimePicker \} from '@\/components\/ui\/BrainDatePicker'/);
  assert.match(card, /publishTime: time \|\| null/);
  assert.doesNotMatch(card, /type="time"/, 'never a native time input');
  assert.match(card, /<SocialPublishingPanel/);
  assert.match(card, /socialAccounts=\{plan\?\.client\?\.socialAccounts \|\| \[\]\}/);
  assert.match(card, /api\/social\/publications/);
  assert.match(card, /setPublicationProblems\(data\.problems\)/, 'the 422 problems reach the panel');
});

test('the publishing band only offers «Programar» explicitly and explains itself with the shared rule', () => {
  const panel = read('src/components/modules/ContentPlan/SocialPublishingPanel.jsx');
  assert.match(panel, /schedulingProblems\(/);
  assert.match(panel, /Programar\s*<\/button>/);
  assert.match(panel, /Cancelar/);
  assert.match(panel, /Reintentar/);
  assert.match(panel, /no tiene Instagram ni Facebook conectados/);
  assert.doesNotMatch(panel, /encryptedToken|access_token/);
  assert.match(panel, /dark:/, 'dual theme');
});

// Rodny, 1 October 2026: he deleted the post on both networks to fix an image and the band still said
// «Publicada» with nothing to press.
test('a published row offers «Publicar de nuevo», which asks first because a post left on the network would be doubled', () => {
  const panel = read('src/components/modules/ContentPlan/SocialPublishingPanel.jsx');
  assert.match(panel, /Publicar de nuevo/);
  assert.match(panel, /onReopen\(row\.id, account\.platform\)/);
  // A reopened network comes back ticked: the band remembers what was unticked, not what was ticked.
  assert.match(panel, /excluded/);
  // The reason a row is cancelled (reopened, hour moved to the past) is said, not just «Cancelada».
  assert.match(panel, /CANCELLED: \(row\) => row\.error \|\| 'Cancelada'/);
  const card = read('src/components/modules/ContentPlanDetail.jsx');
  assert.match(card, /publications\/\$\{publicationId\}\/reopen/);
  const handler = card.slice(card.indexOf('const handleReopenPublication'));
  assert.match(handler, /await confirm\(/);
  assert.match(handler, /duplicad/);
  assert.ok(handler.indexOf('await confirm(') < handler.indexOf('reopenPublicationMutation.mutate('), 'nothing is reopened before the person says yes');
});

test('the client card lists connected networks and only managers connect or disconnect', () => {
  const widget = read('src/components/modules/SocialAccountsWidget.jsx');
  assert.match(widget, /api\/social\/accounts\/available/);
  assert.match(widget, /api\/social\/accounts\/link/);
  assert.match(widget, /canManage &&/);
  assert.doesNotMatch(widget, /type="text"[^>]*token/i, 'nobody pastes a token');
  // 1 October 2026: 69 pages. The list is searched, scrolls inside the dialog, and «Conectar» only
  // sends a page that is in sight — a page hidden by the search can never be connected by mistake.
  assert.match(widget, /filterSocialPages\(pages, search\)/);
  assert.match(widget, /type="search"/);
  assert.match(widget, /aria-label="Buscar página"/);
  assert.match(widget, /overflow-y-auto/);
  assert.match(widget, /visible\.some\(\(page\) => page\.pageId === pageId\)/);
  assert.match(widget, /Ninguna página coincide/);
  const detail = read('src/components/modules/ClientDetail.jsx');
  assert.match(detail, /<SocialAccountsWidget clientId=\{client\.id\} canManage=\{canManageSocial\} \/>/);
  assert.match(detail, /\['ADMIN', 'PROJECT_MANAGER'\]/);
  // 30 September 2026, seen in production: the grid stretched the sidebar column and two `h-full`
  // widgets claimed its whole height, so Chat Flow and Redes conectadas were squashed to their header.
  assert.match(detail, /lg:col-span-1 lg:self-start flex flex-col gap-6/);
});

test('the plan payload carries the publications of each piece and the client accounts without tokens', () => {
  const service = read('src/services/contentService.js');
  assert.match(service, /publishTime: true/);
  assert.match(service, /publications: publicationSelect/);
  assert.match(service, /client: clientWithSocialAccounts/);
  assert.doesNotMatch(service.slice(service.indexOf('const clientWithSocialAccounts'), service.indexOf('const clientWithSocialAccounts') + 400), /encryptedToken/);
  assert.match(service, /resyncItemPublications\(id\)/);
  assert.match(service, /formato HH:mm/);
});

test('notifications about a publication open the piece in its plan', () => {
  const utils = read('src/utils/notificationUtils.js');
  assert.match(utils, /SOCIAL_PUBLICATION_PUBLISHED/);
  assert.match(utils, /SOCIAL_PUBLICATION_FAILED/);
  const layout = read('src/components/layout/AppLayout.jsx');
  assert.match(layout, /SOCIAL_PUBLICATION_PUBLISHED' \|\| notif\.type === 'SOCIAL_PUBLICATION_FAILED'/);
  assert.match(layout, /\/parrillas\/\$\{notif\.resourceId\}\?item=\$\{notif\.relatedId\}/);
});

test('the environment example documents the Meta system user token', () => {
  assert.match(read('.env.example'), /META_SYSTEM_USER_TOKEN=/);
});
