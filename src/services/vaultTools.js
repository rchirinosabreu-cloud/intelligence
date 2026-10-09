// Bria y la bóveda: Bria encuentra el acceso y la plataforma lo muestra. El modelo recibe solo el nombre,
// la plataforma y el cliente; nunca el usuario ni la contraseña. La persona pulsa «Ver acceso» en la
// tarjeta de la respuesta, la plataforma comprueba su permiso, registra la lectura y le muestra el valor.

import { canUseBria } from '../lib/briaLivingMemory.js';
import { canUseVault } from '../lib/vaultAccess.js';

export const createVaultTools = (service) => service ? [{
  name: 'buscar_acceso',
  description: 'Busca en la bóveda de accesos de la agencia las cuentas de un cliente o de la agencia (Instagram, Meta Business, hosting, Canva, correo…). Devuelve solo nombre, plataforma y cliente: la contraseña la muestra la plataforma en una tarjeta con el botón «Ver acceso», nunca tú. Pásale el clientId de buscar_cliente si es de un cliente.',
  parameters: { type: 'object', properties: {
    clientId: { type: ['string', 'null'] },
    consulta: { type: 'string', description: 'Plataforma o nombre de la cuenta, por ejemplo «instagram» o «hosting».' }
  }, required: ['clientId', 'consulta'], additionalProperties: false },
  allowed: (user) => canUseBria(user) && canUseVault(user),
  async run({ clientId = null, consulta = '' } = {}, { user }) {
    const rows = (await service.list(user, { clientId: clientId || null, query: consulta })).slice(0, 8);
    const accessCards = rows.map((row) => ({ id: row.id, cliente: row.clientName || 'Brain Studio', plataforma: row.platform, nombre: row.label || row.platform }));
    return {
      data: {
        accesos: accessCards.map(({ cliente, plataforma, nombre }) => ({ cliente, plataforma, nombre })),
        instruccion: accessCards.length
          ? 'Dile a la persona que pulse el botón «Ver acceso» en la tarjeta que aparece bajo tu respuesta. Nunca escribas ni inventes usuarios o contraseñas, ni le pidas que los pegue en el chat.'
          : 'No hay accesos que esta persona pueda ver con esa búsqueda. Puede pedirlo a un administrador o guardarlo en la página Bóveda; nunca en el chat.'
      },
      accessCards
    };
  }
}] : [];
