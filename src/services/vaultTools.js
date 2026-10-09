// Bria y la bóveda (Rodny, 9 de octubre de 2026: «eso me lo puede dar la misma Bria cuando yo se lo
// pregunte … si quiero guardar una contraseña se lo digo a Bria»). Todo se hace conversando, pero la
// contraseña nunca pasa por el modelo:
// - Para darla, Bria encuentra el acceso y la plataforma la muestra en la tarjeta de su respuesta.
// - Para guardarla o cambiarla, Bria reúne cliente, plataforma y usuario conversando, y la clave se escribe
//   en un campo protegido de esa misma respuesta, que la guarda directo en la bóveda.
// El modelo recibe solo nombres, plataformas y clientes; nunca usuarios cifrados, contraseñas ni notas.

import { randomUUID } from 'node:crypto';
import { canUseBria } from '../lib/briaLivingMemory.js';
import { canUseVault, canEditCredential } from '../lib/vaultAccess.js';

const toolError = (message, status = 400, code = 'VAULT_TOOL') => Object.assign(new Error(message), { status, code });
const fold = (value) => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const retireIntent = (text) => /(?<![\p{L}\p{N}])(olvida(lo|la)?|retira(lo|la)?|elimina(lo|la)?|b[oó]rra(lo|la)?|ya\s+no\s+se\s+usa|ya\s+no\s+existe|da\s+de\s+baja)(?![\p{L}\p{N}])/iu.test(String(text || ''));
const shareIntent = (text) => /(?<![\p{L}\p{N}])(comp[aá]rt[eií]\p{L}*|dale\s+acceso|que\s+(lo|la)\s+(vea|pueda\s+ver))(?![\p{L}\p{N}])/iu.test(String(text || ''));
const isAdmin = (user) => String(user?.role || '').toUpperCase() === 'ADMIN';
const card = (row) => ({ id: row.id, cliente: row.clientName || 'Brain Studio', plataforma: row.platform, nombre: row.label || row.platform });
const text = (value, max) => (value == null ? null : String(value).trim().slice(0, max) || null);

export const createVaultTools = (service) => service ? [
  {
    name: 'buscar_acceso',
    description: 'Busca en la bóveda los accesos de un cliente o de la agencia (Instagram, Meta Business, hosting, correo, Canva…) que esta persona puede ver. Úsala cuando pida un usuario o una contraseña. Devuelve solo nombre, plataforma y cliente: la plataforma muestra el acceso en una tarjeta bajo tu respuesta, nunca tú. Pásale el clientId de buscar_cliente si es de un cliente.',
    parameters: { type: 'object', properties: {
      clientId: { type: ['string', 'null'] },
      consulta: { type: 'string', description: 'Plataforma o nombre de la cuenta, por ejemplo «instagram» o «correo».' }
    }, required: ['clientId', 'consulta'], additionalProperties: false },
    allowed: (user) => canUseBria(user) && canUseVault(user),
    async run({ clientId = null, consulta = '' } = {}, { user }) {
      const rows = (await service.list(user, { clientId: clientId || null, query: consulta })).slice(0, 8);
      const accessCards = rows.map(card);
      return {
        data: {
          accesos: rows.map((row) => ({ id: row.id, ...card(row), version: row.revision })),
          instruccion: accessCards.length
            ? 'El acceso aparece bajo tu respuesta en una tarjeta; si es uno solo, ya se muestra. Nunca escribas ni inventes usuarios o contraseñas.'
            : 'No hay accesos que esta persona pueda ver con esa búsqueda. Si quiere guardarlo, usa preparar_acceso; si es de otro cliente, lo ve su PM o un administrador.'
        },
        accessCards
      };
    }
  },
  {
    name: 'preparar_acceso',
    description: 'Prepara guardar un acceso nuevo en la bóveda, o cambiar uno existente (con accesoId de buscar_acceso), cuando la persona lo pide. Reúne conversando el cliente (clientId de buscar_cliente, o null si es de la agencia), la plataforma, un nombre corto y, si lo dice, el usuario o correo, el enlace y notas. NO recibe la contraseña: bajo tu respuesta aparece un campo protegido donde la persona la escribe, y se guarda directo en la bóveda. Pide solo lo que falte.',
    parameters: { type: 'object', properties: {
      accesoId: { type: ['string', 'null'], description: 'Para cambiar un acceso que ya existe.' },
      clientId: { type: ['string', 'null'] },
      plataforma: { type: ['string', 'null'], description: 'Instagram, Facebook, Gmail, Hostinger, Canva…' },
      nombre: { type: ['string', 'null'], description: 'Nombre corto: «Correo principal», «Cuenta de pauta».' },
      usuario: { type: ['string', 'null'], description: 'Usuario o correo de la cuenta, si la persona lo dijo.' },
      enlace: { type: ['string', 'null'] },
      notas: { type: ['string', 'null'], description: 'Doble factor, correo de recuperación… sin contraseñas.' }
    }, required: ['accesoId', 'clientId', 'plataforma', 'nombre', 'usuario', 'enlace', 'notas'], additionalProperties: false },
    allowed: (user) => canUseBria(user) && canUseVault(user),
    async run(args = {}, { user, db }) {
      const actor = await service.resolve(user);
      const existing = args.accesoId ? await service.get(user, String(args.accesoId)) : null;
      if (args.accesoId && !existing) throw toolError('No encontré ese acceso entre los que puedes ver.', 404, 'VAULT_NOT_FOUND');
      const clientId = existing ? existing.clientId : (args.clientId || null);
      if (!canEditCredential(actor, { clientId })) throw toolError(clientId ? 'Solo puedes guardar accesos de los clientes que llevas como PM. Pídeselo a un administrador.' : 'Los accesos de la agencia los guarda un administrador.', 403, 'VAULT_FORBIDDEN');
      const platform = text(args.plataforma, 60) || existing?.platform;
      if (!platform) throw toolError('Falta la plataforma: pregúntale de qué cuenta se trata.', 400, 'VAULT_PLATFORM');
      const client = clientId && db?.client ? await db.client.findUnique({ where: { id: clientId }, select: { name: true } }) : null;
      if (clientId && db?.client && !client) throw toolError('No encontré ese cliente: búscalo con buscar_cliente.', 404, 'VAULT_CLIENT');
      const accessCapture = {
        captureId: randomUUID(), mode: existing ? 'UPDATE' : 'NEW',
        ...(existing ? { credentialId: existing.id, revision: existing.revision } : {}),
        clientId, clientName: client?.name || existing?.clientName || 'Brain Studio',
        platform, label: text(args.nombre, 120) || existing?.label || platform,
        username: text(args.usuario, 300), url: text(args.enlace, 500), notes: text(args.notas, 4000)
      };
      return {
        data: { listo: true, modo: accessCapture.mode === 'NEW' ? 'nuevo' : 'cambio', cliente: accessCapture.clientName, plataforma: platform, nombre: accessCapture.label,
          instruccion: 'Dile que escriba la contraseña en el campo protegido que aparece bajo tu respuesta y pulse «Guardar en la bóveda». Nunca le pidas que la escriba en el chat.' },
        accessCapture
      };
    }
  },
  {
    name: 'retirar_acceso',
    description: 'Retira un acceso de la bóveda (con su id y versión de buscar_acceso) solo cuando la persona lo pide explícitamente: «olvida», «elimina», «ya no se usa». Deja de aparecer, pero queda en el historial.',
    parameters: { type: 'object', properties: { accesoId: { type: 'string' }, version: { type: 'integer' } }, required: ['accesoId', 'version'], additionalProperties: false },
    allowed: (user) => canUseBria(user) && canUseVault(user),
    async run({ accesoId, version } = {}, { user, question }) {
      if (!retireIntent(question)) throw toolError('Hace falta que la persona pida retirar ese acceso. Pregúntale si quiere hacerlo.', 400, 'VAULT_NO_INTENT');
      const row = await service.retire(user, String(accesoId), Number.isInteger(version) ? version : null, 'Retirado conversando con Bria');
      return { data: { retirado: true, nombre: row.label || row.platform } };
    }
  },
  {
    name: 'quien_vio_acceso',
    description: 'Quién vio un acceso de la bóveda y cuándo (con su id de buscar_acceso). Solo administradores.',
    parameters: { type: 'object', properties: { accesoId: { type: 'string' } }, required: ['accesoId'], additionalProperties: false },
    allowed: (user) => canUseBria(user) && canUseVault(user) && isAdmin(user),
    async run({ accesoId } = {}, { user }) {
      const rows = await service.reveals(user, String(accesoId));
      return { data: { lecturas: rows.slice(0, 30).map((row) => ({ persona: row.persona, desde: row.via === 'BRIA' ? 'Bria' : 'la bóveda', fecha: new Date(row.fecha).toISOString() })) } };
    }
  },
  {
    name: 'compartir_acceso',
    description: 'Comparte un acceso (id y versión de buscar_acceso) con project managers del equipo, por su nombre, cuando un administrador lo pide. Solo administradores.',
    parameters: { type: 'object', properties: { accesoId: { type: 'string' }, version: { type: 'integer' }, personas: { type: 'array', items: { type: 'string' }, maxItems: 10 } }, required: ['accesoId', 'version', 'personas'], additionalProperties: false },
    allowed: (user) => canUseBria(user) && canUseVault(user) && isAdmin(user),
    async run({ accesoId, version, personas = [] } = {}, { user, question, db }) {
      if (!shareIntent(question)) throw toolError('Hace falta que la persona pida compartir ese acceso.', 400, 'VAULT_NO_INTENT');
      const current = await service.get(user, String(accesoId));
      if (!current) throw toolError('No encontré ese acceso.', 404, 'VAULT_NOT_FOUND');
      const members = await db.teamMember.findMany({ where: { isActive: true, userId: { not: null } }, select: { name: true, userId: true, user: { select: { role: true, isActive: true } } } });
      const chosen = [], unknown = [];
      for (const name of personas) {
        const matches = members.filter((m) => m.user?.isActive !== false && ['ADMIN', 'PROJECT_MANAGER'].includes(m.user?.role) && fold(m.name).includes(fold(name)));
        if (matches.length === 1) chosen.push(matches[0]); else unknown.push(name);
      }
      if (unknown.length) throw toolError(`No identifiqué con certeza a: ${unknown.join(', ')}. Pregúntale el nombre completo; solo se comparte con administradores y project managers activos.`, 400, 'VAULT_PEOPLE');
      const shared = [...new Set([...(current.sharedUserIds || []), ...chosen.map((m) => m.userId)])];
      await service.update(user, current.id, Number.isInteger(version) ? version : current.revision, { sharedUserIds: shared });
      return { data: { compartidoCon: chosen.map((m) => m.name) } };
    }
  }
] : [];
