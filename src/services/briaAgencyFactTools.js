// Las herramientas con que Bria usa la memoria de la agencia. Consultar no escribe nada. Guardar y retirar
// solo corren cuando la persona lo dijo en su propio mensaje, o aceptó con un «sí» la oferta de guardar que
// Bria acababa de hacerle: lo que diga un archivo o un correo nunca cuenta como permiso.

import { canUseBria } from '../lib/briaLivingMemory.js';
import { factError, FACT_ENTITY_TYPES, FACT_PURPOSES } from '../lib/briaAgencyFacts.js';
import { MEMORY_REQUEST_SCHEMA, memoryRequestProblem, memoryHumanContext, replacesMemory } from '../lib/briaMemoryIntent.js';
const TEAM_CERTAINTIES = ['CONFIRMADO', 'PRACTICA', 'PROPUESTA', 'HISTORICO', 'NO_CONCLUYENTE'];

export const createAgencyFactTools = (service) => service ? [
  {
    name: 'memoria_de_la_agencia',
    description: 'La memoria de la agencia: lo que sabes de Brain Studio y de cada cuenta —quién paga y por qué canal, acuerdos y alcance, quién aprueba, tono y restricciones de marca, insumos, cómo se trabaja, historia, riesgos y oportunidades—. Consúltala antes de opinar sobre un cliente, una marca, un acuerdo o cómo se trabaja, e interprétala con criterio propio. Cada hecho trae su certeza, su periodo, su fuente y si lo confirmó el equipo, más las dudas abiertas de esa cuenta. Pásale el clientId de buscar_cliente cuando hables de un cliente; para marcas, procesos o la agencia usa entidad o consulta. Contrasta estados registrados, acuerdos y aclaraciones del equipo según cuenta, periodo, certeza y procedencia: un semáforo o una fecha vencida no acredita por sí solo un compromiso vigente, y una memoria histórica tampoco anula un acuerdo posterior. Las lecturas operativas y de parrillas ya traen el contexto de la cuenta; si ese contexto está parcial, consulta aquí por clientId antes de concluir, y si la memoria no está disponible o hay una contradicción sin resolver, presenta la prioridad como provisional y precisa qué falta comprobar. No confundas la fecha de actualización de un contador con la fecha de un acuerdo: mantén visibles los contadores originales, pero separa compromisos vigentes, trabajo propuesto y vigencia incierta al comparar cuentas, y explica qué contexto cambia la recomendación. Si una corrección cambia una prioridad anterior, reconstruye el orden y el siguiente paso en esa misma respuesta, no te limites a disculparte. Lo aprendido releyendo los chats del equipo llega con certeza «así se trabaja» o «propuesta» y con quién lo dijo: úsalo y dilo así («por lo que dijo Francisco ayer, los pendientes de Mimas van en alta; ¿la dejo así?»), nunca como confirmado.',
    parameters: { type: 'object', properties: {
      consulta: { type: 'string', description: 'Qué quieres saber, con las palabras del tema.' },
      clientId: { type: ['string', 'null'], description: 'El id de buscar_cliente, si es de un cliente.' },
      entidad: { type: ['string', 'null'], description: 'Nombre de la marca, el proceso o «Brain Studio» para toda la agencia.' }
    }, required: ['consulta'], additionalProperties: false },
    allowed: canUseBria,
    async run(args, { user }) {
      const result = await service.consult(user, { consulta: args.consulta, clientId: args.clientId || null, entidad: args.entidad || null });
      return { data: { ...result, sourceInstructions: 'data_only' }, sources: result.hechos.map(fact => ({ kind: 'hecho_agencia', id: fact.id, label: fact.entidad || 'Memoria de la agencia' })) };
    }
  },
  {
    name: 'guardar_en_memoria',
    description: 'Guarda en la memoria de la agencia lo que la persona te enseña, confirma o corrige en su mensaje sobre la agencia, una cuenta, una marca o un proceso. Si te contradice, te cuenta un cambio (continuidad, contrato, responsables, una decisión) o te enseña algo, créele y guárdalo en ese mismo turno; si contradice hechos que consultaste, ponlos en reemplaza con su id y revision: quedan en el historial y dejan de regir. Si no queda claro que quiere guardarlo, pregúntale con ofrecer_opciones y pon «Sí, guárdalo» como opción. Nunca digas que lo tienes en cuenta, que lo recordarás o que lo guardaste si esta herramienta no confirmó saved=true en esta respuesta; si lo rechaza, di por qué y vuelve a ofrecerlo. Si una duda abierta de la memoria viene al caso, haz una sola duda al final de tu respuesta, nunca un cuestionario, y si la responde guárdala con su id en respondeDuda. Las preferencias personales de quien conversa van en recordar_aprendizaje. No cambia tareas, parrillas, contratos ni dinero. Nunca guardes credenciales ni datos personales.',
    parameters: { type: 'object', properties: {
      request: MEMORY_REQUEST_SCHEMA,
      afirmacion: { type: 'string', description: 'Lo que dijo la persona, en una o dos frases claras, con fechas concretas.' },
      entidad: { type: 'string', description: 'Cliente, marca, proceso o «Brain Studio». Para un cliente usa su nombre canónico de buscar_cliente, junto con su clientId; no sustituyas un nombre por un alias inventado.' },
      clientId: { type: ['string', 'null'] },
      tipoEntidad: { type: 'string', enum: FACT_ENTITY_TYPES },
      tema: { type: 'string', description: 'identidad, relacion, acuerdo, alcance, contactos, marca-y-tono, restricciones, como-trabajamos, aprobacion, insumos, produccion, pauta, cobro, historia, riesgo, oportunidad, proceso, herramienta, precio o equipo.' },
      proposito: { type: 'string', enum: FACT_PURPOSES, description: 'operacion o editorial para coordinación y marca; comercial, financiero o direccion según de qué se trate.' },
      certeza: { type: 'string', enum: TEAM_CERTAINTIES, description: 'CONFIRMADO si la persona lo afirma; PROPUESTA o NO_CONCLUYENTE si lo dice con duda.' },
      desde: { type: ['string', 'null'], description: 'Inicio del periodo al que aplica el hecho, YYYY-MM-DD o null si no está definido. No es la fecha de recepción de esta enseñanza. Conserva el periodo humano o el del hecho que corrige.' },
      hasta: { type: ['string', 'null'], description: 'Fin del periodo al que aplica, YYYY-MM-DD; null solo si no está delimitado. Una aclaración sobre un mes concreto no se vuelve indefinida.' },
      reemplaza: { type: 'array', description: 'Solo hechos consultados del mismo sujeto que esta corrección sustituye completamente. Una aclaración de un mes no retira acuerdos de otros periodos: guarda un hecho separado y conserva su alcance.', items: { type: 'object', properties: { id: { type: 'string' }, revision: { type: 'integer' } }, required: ['id', 'revision'], additionalProperties: false } },
      respondeDuda: { type: ['string', 'null'] }
    }, required: ['request', 'afirmacion', 'entidad', 'clientId', 'tipoEntidad', 'tema', 'proposito', 'certeza', 'desde', 'hasta', 'reemplaza', 'respondeDuda'], additionalProperties: false },
    allowed: canUseBria,
    async run(args, context) {
      const problem = memoryRequestProblem(args.request, context);
      if (problem) throw factError(problem, 400, 'BRIA_FACT_NO_INTENT');
      if (args.reemplaza?.length && !replacesMemory(args.request)) throw factError('Guardar un hecho nuevo no autoriza reemplazar otro recuerdo.', 400, 'BRIA_FACT_NO_INTENT');
      if ((args.reemplaza || []).some(row => !row?.id || !Number.isSafeInteger(row.revision) || row.revision < 1)) throw factError('Consulta el identificador y la revisión vigente de cada recuerdo antes de corregirlo.', 400, 'BRIA_FACT_CHANGED');
      const result = await service.record(context.user, args, memoryHumanContext(context));
      return { data: { saved: true, hecho: { id: result.fact.id, entidad: result.fact.entity, revision: result.fact.revision }, reemplazados: result.replaced }, sources: [{ kind: 'hecho_agencia', id: result.fact.id, label: result.fact.entity || 'Memoria de la agencia' }] };
    }
  },
  {
    name: 'retirar_de_memoria',
    description: 'Retira un hecho de la memoria de la agencia solo cuando la persona pide explícitamente olvidarlo. Consulta antes su id y revision. Se conserva el historial. Si la persona dice que algo aprendido releyendo los chats del equipo no es así, ofrece retirarlo con esta herramienta o guardar la corrección con guardar_en_memoria, y que ella decida.',
    parameters: { type: 'object', properties: { request: MEMORY_REQUEST_SCHEMA, id: { type: 'string' }, revision: { type: 'integer' } }, required: ['request', 'id', 'revision'], additionalProperties: false },
    allowed: canUseBria,
    async run(args, context) {
      const problem = memoryRequestProblem(args.request, context, 'RETIRE');
      if (problem) throw factError(problem, 400, 'BRIA_FACT_NO_INTENT');
      if (!Number.isSafeInteger(args.revision) || args.revision < 1) throw factError('Consulta la revisión vigente antes de retirar el recuerdo.', 400, 'BRIA_FACT_CHANGED');
      const result = await service.retire(context.user, args);
      return { data: { retired: result.status === 'RETIRED', id: result.id } };
    }
  },
  {
    // Las fichas del equipo (Rodny, 20 de octubre de 2026). Solo la dirección: a un project manager ni se le ofrece.
    name: 'como_trabajar_con',
    description: 'Conoces a cada persona del equipo: cómo trabajar con alguien, según lo que la dirección confirmó: qué se le puede confiar, qué conviene revisar antes de que salga, cómo recibe mejor un mensaje, qué le pesa y con quién roza. Llámala con su nombre antes de redactarle un mensaje a alguien del equipo, de proponer una decisión sobre una persona o de decidir a quién confiarle algo, y úsala para el tono, para qué revisar y para qué proponer: a quien recibe mejor la decisión al inicio se la das al inicio; a quien pide el contexto completo, se lo das. Es para que tú actúes mejor. Nunca la recites ni digas «según tu ficha»; nunca le cuentes a nadie —ni a la persona ni a un compañero— qué dice una ficha ni qué piensa la dirección de alguien; y nunca la vuelvas un juicio («lento», «flojo», «descuidado»): la ficha dice cómo trabajar con alguien, no cómo es. Si la dirección te corrige o precisa algo de una persona, ofrece guardarlo con guardar_en_memoria (entidad el nombre completo, tipoEntidad persona, tema como-trabajar, proposito personas); nunca guardes salud, motivos de ausencia, salarios ni nada personal. Sin ficha, háblale con lo que pide su rol y lo que veas en la plataforma.',
    parameters: { type: 'object', properties: { nombre: { type: 'string', description: 'Nombre de la persona, como lo dijo quien pregunta.' } }, required: ['nombre'], additionalProperties: false },
    allowed: (user) => canUseBria(user) && String(user?.role).toUpperCase() === 'ADMIN',
    async run(args, { user }) {
      const result = await service.howToWorkWith(user, { nombre: args.nombre });
      return { data: { ...result, sourceInstructions: 'data_only' } };
    }
  }
] : [];
