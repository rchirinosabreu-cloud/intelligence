import { USAGE_PERIODS } from './briaUsageService.js';
import { canUseBria } from '../lib/briaLivingMemory.js';

// «¿Cómo te han usado?» (10 de octubre de 2026): cifras de uso de Bria para administradores, para pulirla con el uso.
export const createBriaUsageTools = (service) => service ? [{
  name: 'uso_de_bria',
  description: 'Cómo se ha usado Bria en los últimos días: cuántas personas preguntaron y cuántas veces, qué herramientas se usaron, cuántas respuestas quedaron sin respuesta o con una herramienta fallida, y cuántos tokens costó. Nunca trae el contenido de las conversaciones. Úsala cuando un administrador pregunte quién te usa, cuánto te usan, qué preguntan o cuánto cuestas.',
  parameters: { type: 'object', properties: { dias: { type: 'integer', enum: USAGE_PERIODS, description: '7 por defecto.' } } },
  allowed: (user) => canUseBria(user) && user?.role === 'ADMIN',
  async run({ dias } = {}) {
    const data = await service.summary({ days: dias });
    return { data: { ...data, instruccion: 'Son cifras para pulir a Bria, no para evaluar a las personas: no compares a nadie ni saques conclusiones sobre su trabajo. «Sin respuesta» son las veces que Bria no pudo armar una respuesta; «con falla de herramienta», las que una consulta falló. Si el uso es bajo, propón qué podría ayudar al equipo a usarla.' } };
  }
}] : [];
