import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// La tarjeta «Bria en WhatsApp» del perfil (20 de octubre de 2026): la persona vincula su número con un código que
// ella misma le manda a Bria; la tarjeta solo existe para quien tiene Bria y sigue las reglas de superficie de IA.

// Los saltos de línea se igualan: en una copia de Windows el archivo llega con CRLF y las búsquedas por texto fallarían.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const card = read('src/components/profile/WhatsAppLink.jsx');

test('el perfil monta la tarjeta solo en el perfil propio, en la tercera columna, bajo la verificación en dos pasos', () => {
  const profile = read('src/components/modules/Profile.jsx');
  assert.match(profile, /import WhatsAppLink from '@\/components\/profile\/WhatsAppLink'/);
  // Tres columnas iguales (Rodny, 21 de octubre de 2026): información, seguridad, y verificación con Bria.
  // Y las tres al mismo alto: la fila se estira y las tarjetas de información y seguridad la llenan.
  assert.match(profile, /grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch" data-profile-general-grid/);
  assert.equal((profile.slice(profile.indexOf('data-profile-general-grid'), profile.indexOf('data-profile-security-column')).match(/<div className="min-w-0 flex flex-col">\s*(?:\{isOwnProfile \? \()?\s*<Card className="flex-1 /g) || []).length, 2);
  assert.doesNotMatch(profile.slice(profile.indexOf('data-profile-general-grid'), profile.indexOf('data-profile-security-column')), /lg:col-span-2/);
  // La columna la comparte con los avisos desde el 26 de octubre de 2026: verificación,
  // avisos y Bria en WhatsApp, en ese orden y solo en el perfil propio.
  assert.match(profile, /\{isOwnProfile && \(\s*<div className="min-w-0 space-y-6" data-profile-security-column>\s*<MfaSettings \/>\s*<NotificationSettings \/>\s*<WhatsAppLink \/>\s*<\/div>\s*\)\}/);
});

test('solo quien tiene Bria la ve, y el vínculo nace de la plataforma: código, número de Bria y enlace a WhatsApp', () => {
  assert.match(card, /if \(!canUseBria\(currentUser\)\) return null;/);
  assert.match(card, /\/api\/bria\/whatsapp/);
  assert.match(card, /api\('\/link-code', \{ method: 'POST' \}\)/);
  assert.match(card, /href=\{code\.link\} target="_blank" rel="noopener noreferrer"/);
  assert.match(card, /Vincular mi WhatsApp/);
  assert.match(card, /Desvincular/);
  assert.match(card, /El código vale 10 minutos/);
});

test('el aviso de vinculado sale solo con la respuesta del servidor, y el sondeo se detiene al vencer el código', () => {
  const poll = card.slice(card.indexOf('useEffect(() => {\n    if (!code || status?.linked)'), card.indexOf('}, [code, status?.linked]);'));
  assert.match(poll, /const fresh = await api\(''\);\s*if \(fresh\.linked\) \{[^}]*toast\.success\('Tu WhatsApp quedó vinculado con Bria'\)/);
  assert.match(poll, /Date\.now\(\) > expiresAt/);
  assert.match(poll, /return \(\) => clearInterval\(timer\);/);
  assert.doesNotMatch(card, /new Date\(\)\s*\]/, 'nunca un reloj como dependencia');
});

test('superficie de IA: cabecera con el degradado aprobado y la mascota, cuerpo neutro en claro y oscuro, sin colores locales', () => {
  assert.match(card, /brain-ai-header/);
  assert.match(card, /<BriaPortrait /);
  assert.match(card, /bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/);
  assert.doesNotMatch(card, /#[0-9a-fA-F]{6}\b/);
  assert.doesNotMatch(card, /\b(purple|violet|indigo|fuchsia|sky|teal|emerald|red|rose)-\d/);
  assert.doesNotMatch(card, /vosotros|tenéis|podéis|\bos\b/);
  assert.match(card, /text-destructive/);
  assert.doesNotMatch(card, /window\.confirm/);
  assert.match(card, /useConfirmDialog/);
});

test('los avisos por WhatsApp: un interruptor por tipo, que solo cambia con la respuesta del servidor', () => {
  assert.match(card, /import \{ ALERT_KIND_LABELS \} from '@\/lib\/whatsappAlertKinds'/);
  assert.match(card, /data-whatsapp-alerts/);
  assert.match(card, /Avisos que te llegan por aquí/);
  assert.match(card, /role="switch"/);
  assert.match(card, /aria-checked=\{on\}/);
  const toggle = card.slice(card.indexOf('const toggleAlert'), card.indexOf('const unlink'));
  assert.match(toggle, /api\('\/alerts', \{ method: 'PATCH'/);
  assert.match(toggle, /setStatus\(\(current\) => \(\{ \.\.\.current, alerts: current\.alerts\.map\(\(row\) => \(row\.kind === saved\.kind \? \{ \.\.\.row, on: saved\.on \} : row\)\) \}\)\)/, 'se pinta lo que devolvió el servidor');
  const kinds = read('src/lib/whatsappAlertKinds.js');
  assert.doesNotMatch(kinds, /^import /m, 'la pantalla no arrastra nada del servidor');
  assert.match(kinds, /Pedidos de acceso/);
});
