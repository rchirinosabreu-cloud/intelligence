import { canUseBria } from '../lib/briaLivingMemory.js';

// El semáforo de servicios, a pedido (Rodny, 22 de octubre de 2026: «mejor sin avisos por servicio caído, a menos
// que se pregunte»). Bria no avisa una caída por WhatsApp; si un administrador le pregunta, lee el semáforo y lo dice.
const COLOR = { GREEN: 'verde', YELLOW: 'amarillo', RED: 'rojo', GRAY: 'gris' };

export const createServiceHealthTools = (service) => service ? [{
  name: 'estado_de_servicios',
  description: 'El semáforo de los servicios externos de la plataforma (OpenAI, Fireflies, Google, Meta, almacenamiento, correo, avisos al celular, WhatsApp, TRM): el color general y cuáles fallan, con su motivo. Úsala solo cuando un administrador pregunte si algo está caído, si un servicio funciona o por qué algo no anda, y responde con lo que dice el semáforo. Nunca avises una caída sin que te pregunten. Solo administradores.',
  parameters: { type: 'object', properties: {} },
  allowed: (user) => canUseBria(user) && user?.role === 'ADMIN',
  async run() {
    const summary = await service.getSummary();
    return {
      data: {
        general: COLOR[summary.overall] || 'sin dato',
        revisadoEn: summary.lastCheckedAt || null,
        conProblemas: (summary.troubled || []).map((row) => ({ servicio: row.label, color: COLOR[row.light] || row.light, motivo: row.reason })),
        instruccion: 'Dilo en una o dos frases: qué falla, desde cuándo si se sabe y qué afecta. Si todo está en verde, dilo así. No inventes causas ni pasos que el semáforo no dice; el detalle está en Salud operativa.'
      }
    };
  }
}] : [];
