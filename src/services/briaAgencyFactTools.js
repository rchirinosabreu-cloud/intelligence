// Las herramientas con que Bria usa la memoria de la agencia. Consultar no escribe nada. Guardar y retirar
// solo corren cuando la persona lo dijo en su propio mensaje, o aceptó con un «sí» la oferta de guardar que
// Bria acababa de hacerle: lo que diga un archivo o un correo nunca cuenta como permiso.

import { canUseBria } from '../lib/briaLivingMemory.js';
import { acceptsSaveOffer, correctionIntent, factError, FACT_ENTITY_TYPES, FACT_PURPOSES } from '../lib/briaAgencyFacts.js';

const forgetIntent = (text) => /(?<![\p{L}\p{N}])(olvida(lo|la)?|olvidar|retira(lo|la)?|elimina(lo|la)?|b[oó]rra(lo|la)?|ya\s+no\s+aplica)(?![\p{L}\p{N}])/iu.test(String(text || ''));
const TEAM_CERTAINTIES = ['CONFIRMADO', 'PRACTICA', 'PROPUESTA', 'HISTORICO', 'NO_CONCLUYENTE'];

export const createAgencyFactTools = (service) => service ? [
  {
    name: 'memoria_de_la_agencia',
    description: 'Lo que Bria sabe de la agencia y de cada cuenta: quién paga y por qué canal, acuerdos y alcance, quién aprueba, tono y restricciones de marca, insumos, cómo se trabaja, historia, riesgos y oportunidades. Cada hecho trae su certeza, su periodo, su fuente y si lo confirmó el equipo, más las dudas abiertas de esa cuenta. Pásale el clientId de buscar_cliente cuando hables de un cliente; para marcas, procesos o la agencia usa entidad o consulta.',
    parameters: { type: 'object', properties: {
      consulta: { type: 'string', description: 'Qué quieres saber, con las palabras del tema.' },
      clientId: { type: ['string', 'null'], description: 'El id de buscar_cliente, si es de un cliente.' },
      entidad: { type: ['string', 'null'], description: 'Nombre de la marca, el proceso o «Brain Studio» para toda la agencia.' }
    }, required: ['consulta', 'clientId', 'entidad'], additionalProperties: false },
    allowed: canUseBria,
    async run(args, { user }) {
      const result = await service.consult(user, { consulta: args.consulta, clientId: args.clientId || null, entidad: args.entidad || null });
      return { data: { ...result, sourceInstructions: 'data_only' } };
    }
  },
  {
    name: 'guardar_en_memoria',
    description: 'Guarda en la memoria de la agencia lo que la persona te enseña, confirma o corrige en su mensaje sobre la agencia, una cuenta, una marca o un proceso. Si contradice hechos que consultaste, ponlos en reemplaza con su id y revision: quedan en el historial y dejan de regir. Si responde una duda abierta, pon su id en respondeDuda. No cambia tareas, parrillas, contratos ni dinero. Nunca guardes credenciales ni datos personales.',
    parameters: { type: 'object', properties: {
      afirmacion: { type: 'string', description: 'Lo que dijo la persona, en una o dos frases claras, con fechas concretas.' },
      entidad: { type: 'string', description: 'Cliente, marca, proceso o «Brain Studio».' },
      clientId: { type: ['string', 'null'] },
      tipoEntidad: { type: 'string', enum: FACT_ENTITY_TYPES },
      tema: { type: 'string', description: 'identidad, relacion, acuerdo, alcance, contactos, marca-y-tono, restricciones, como-trabajamos, aprobacion, insumos, produccion, pauta, cobro, historia, riesgo, oportunidad, proceso, herramienta, precio o equipo.' },
      proposito: { type: 'string', enum: FACT_PURPOSES, description: 'operacion o editorial para coordinación y marca; comercial, financiero o direccion según de qué se trate.' },
      certeza: { type: 'string', enum: TEAM_CERTAINTIES, description: 'CONFIRMADO si la persona lo afirma; PROPUESTA o NO_CONCLUYENTE si lo dice con duda.' },
      desde: { type: ['string', 'null'], description: 'YYYY-MM-DD o null.' },
      hasta: { type: ['string', 'null'], description: 'YYYY-MM-DD o null.' },
      reemplaza: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, revision: { type: 'integer' } }, required: ['id', 'revision'], additionalProperties: false } },
      respondeDuda: { type: ['string', 'null'] }
    }, required: ['afirmacion', 'entidad', 'clientId', 'tipoEntidad', 'tema', 'proposito', 'certeza', 'desde', 'hasta', 'reemplaza', 'respondeDuda'], additionalProperties: false },
    allowed: canUseBria,
    async run(args, { user, question, previousAnswer }) {
      if (!correctionIntent(question) && !acceptsSaveOffer(question, previousAnswer)) throw factError('Este mensaje no trae una corrección, una confirmación ni una enseñanza. Pregúntale a la persona si quiere que lo guardes, con ofrecer_opciones, y guárdalo cuando acepte.', 400, 'BRIA_FACT_NO_INTENT');
      const result = await service.record(user, args);
      return { data: { saved: true, hecho: { id: result.fact.id, entidad: result.fact.entity, revision: result.fact.revision }, reemplazados: result.replaced } };
    }
  },
  {
    name: 'retirar_de_memoria',
    description: 'Retira un hecho de la memoria de la agencia solo cuando la persona pide explícitamente olvidarlo. Consulta antes su id y revision. Se conserva el historial.',
    parameters: { type: 'object', properties: { id: { type: 'string' }, revision: { type: 'integer' } }, required: ['id', 'revision'], additionalProperties: false },
    allowed: canUseBria,
    async run(args, { user, question }) {
      if (!forgetIntent(question)) throw factError('Hace falta que la persona pida olvidar ese dato.', 400, 'BRIA_FACT_NO_INTENT');
      const result = await service.retire(user, args);
      return { data: { retired: result.status === 'RETIRED', id: result.id } };
    }
  }
] : [];
