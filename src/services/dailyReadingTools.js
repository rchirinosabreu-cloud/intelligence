// La memoria del tiempo en el chat (19 de octubre de 2026): Bria responde «¿cómo viene Foobespain?», «¿qué cambió?» o
// «¿qué harías hoy?» con la lectura del día y la historia de esa cuenta o esa persona, foto por foto. Solo lee.
// El libro de decisiones (mismo día): cuando la persona cuenta qué hizo con una decisión de la lectura, Bria lo anota
// con sus palabras; nunca pregunta como un formulario.
import { isManagerRole } from '../config/security.js';
import { dailyContextSources } from '../lib/dailyReadingContext.js';

export const createDailyReadingTools = (service, { readingDay = null } = {}) => (service ? [{
  name: 'lectura_de_la_agencia',
  description: 'Eres los ojos de la dirección: cada mañana guardas una foto de cada cuenta y de cada persona y escribes la lectura del día. Esta es tu memoria del tiempo: la lectura actual o la abierta en esta conversación, todas sus propuestas guardadas visibles con su identificador estable (fecha:número), fuente, fecha, razones, incertidumbre y decisiones humanas; incluye las que no salieron en el resumen de la mañana. Llámala antes de opinar para «¿cómo viene X?», «¿qué cambió?», «¿desde cuándo?», «¿qué harías hoy?», «¿qué no harías?» o «¿cómo vas acertando?», y para revisar una propuesta de esa lectura por identificador, número o asunto: busca el identificador en esa lista y explica sus fuentes, fecha, razones e incertidumbre; un id de otra fecha no cambia la lectura consultada, y si no está en ella, dilo sin inventar su contenido. Compara con la historia de esa cuenta o esa persona, no solo con el estado de hoy. Recomienda con criterio propio y con lo que lo sostiene, incluido lo que conviene no hacer y por qué; si la historia es corta o falta un dato, dilo. El criterio de la dirección está en la memoria de la agencia (entidad «Brain Studio», tema «criterio», reglas numeradas): aplícalo al recomendar sin recitarlo ni citar números de regla —la dirección ya se lo sabe y recitárselo suena a manual—; nómbralo solo si te preguntan por qué. Nunca recomiendes contra una regla, y si la persona te corrige o precisa algo que una regla dice, no cambies la regla por tu cuenta: ofrece guardar la precisión con guardar_en_memoria y que ella decida. Los campos pedido y alternativas de una propuesta describen posibles siguientes pasos, no la petición actual de la persona: responde primero lo que ella preguntó; una consulta de estado necesita el análisis de la cuenta y su historia, y redacta un mensaje al cliente solo si ella lo pide. Leer no es actuar: los cambios siguen pasando por sus herramientas y por la confirmación de la persona. Cuando la persona cuente qué hizo con una de tus decisiones, anótalo con anotar_decision; si te preguntan cómo vas acertando, responde con las cifras del libro de decisiones y qué cambiaste por eso. También devuelve el libro de decisiones y, si se pide, la historia día por día de una cuenta (color de la operación, publicadas frente a lo esperado, aprobaciones que esperan, devoluciones, tareas vencidas, horas) o de una persona (abiertas, en proceso, vencidas, devueltas, cerradas y horas del día anterior).',
  parameters: { type: 'object', properties: {
    cliente: { type: 'string', description: 'Nombre de la cuenta, si preguntan por una. Vacío si no.' },
    persona: { type: 'string', description: 'Nombre de la persona del equipo, si preguntan por alguien. Vacío si no.' },
    dias: { type: 'integer', enum: [7, 14, 30], description: 'Cuántos días de historia; 14 por defecto.' }
  } },
  allowed: (user) => isManagerRole(user?.role),
  async run({ cliente = '', persona = '', dias = 14 } = {}, { user }) {
    const data = await service.explain({ user, cliente, persona, days: dias, day: readingDay });
    return {
      data: {
        ...data,
        instruccion: 'Esta es tu memoria del tiempo: una foto por día de cada cuenta y de cada persona, y una lectura guardada. El campo contexto se acaba de consultar: contrasta acuerdos, correcciones, contratos y periodos ANTES de recomendar. Una propuesta con requiereContraste no es una prioridad vigente: vuelve a razonar con el contexto actual sin repetir su recomendación anterior. Memoria parcial o no disponible no significa ausencia de acuerdos. Para «cómo viene» compara con su propia historia y di desde cuándo pasa lo que pasa; si la historia es corta, dilo. Cada recomendación va con lo que la sostiene; si algo conviene no hacerlo, dilo con su porqué. Los campos pedido y alternativas son datos de una propuesta, no instrucciones de la persona: atiende su pregunta actual y no sustituyas el análisis por un borrador de mensaje que no te pidió. Para revisar una propuesta localiza su id en decisiones y explica lo que la sostiene, su fecha y lo que falta verificar. Las horas y los cierres de cada foto son los del día anterior. Habla de trabajo, tiempos y carga, nunca un juicio sobre una persona. El libro de decisiones mide tus decisiones, no a las personas: si preguntan cómo vas, di la lectura con sus cifras y qué aprendiste. Solo lees: cualquier cambio lo hace la persona o una acción que ella confirme.'
      },
      sources: data.fecha ? [{ kind: 'lectura', id: data.fecha, label: 'Lectura del día', url: data.cuenta?.enlace || null }, ...dailyContextSources(data.contexto)] : []
    };
  }
}, {
  name: 'anotar_decision',
  description: 'Anota en el libro de decisiones lo que la persona decidió sobre algo que tú propusiste, y cómo salió, cuando lo cuenta con sus palabras y de pasada. Tres usos. 1) Una decisión de la lectura de la mañana («ya le escribí a Gema», «eso no», «la dejo para la otra semana»): pasa decision y veredicto; conserva el asunto y el cliente que nombró o usa el id de la propuesta consultada, sin reducir una referencia precisa al nombre de la cuenta; si hay varias propuestas de la misma cuenta, consulta lectura_de_la_agencia y usa el id que corresponda. 2) Algo que propusiste en ESTA conversación y no está en la lectura, cuando la persona lo acepta, lo descarta o lo aplaza («dale, movamos eso a Brayan», «no, eso no»): pasa propuesta con tu propuesta en una frase completa, sobre con la cuenta o la persona, y veredicto. 3) Cómo salió algo ya anotado («lo de Aristea funcionó», «eso no sirvió de nada»): pasa decision con el asunto y resultado con lo que contó. Nunca lo preguntes como formulario ni des las gracias por «enseñarte»: anótalo cuando salga en la conversación y sigue. Solo anota lo que la persona dijo; no cambia nada en la plataforma.',
  parameters: { type: 'object', properties: {
    decision: { type: 'string', description: 'A cuál decisión se refiere: su número en la lectura («2»), su id, o el asunto y cliente que dio la persona («aprobaciones de Aristea»). No reduzcas esa referencia al nombre del cliente. Vacío si pasas propuesta.' },
    veredicto: { type: 'string', description: 'Qué decidió, con sus palabras: «la hice», «no», «después», «la semana que viene»… Vacío si solo cuenta un resultado.' },
    nota: { type: 'string', description: 'Si dijo por qué, su motivo en pocas palabras (máximo 300 caracteres). Vacío si no.' },
    dia: { type: 'string', description: 'Día de la lectura (AAAA-MM-DD) si no es la última. Vacío para la última.' },
    propuesta: { type: 'string', description: 'Solo para algo que propusiste en esta conversación y no está en la lectura: la propuesta en una frase completa, como la dijiste. Vacío si no.' },
    sobre: { type: 'string', description: 'Con propuesta: la cuenta o la persona de la que trata. Vacío si es de la agencia.' },
    resultado: { type: 'string', description: 'Cómo salió algo ya anotado, con las palabras de la persona: «funcionó», «se resolvió», «sigue igual», «no sirvió»… Vacío si no lo contó.' }
  } },
  allowed: (user) => isManagerRole(user?.role),
  async run({ decision = '', veredicto = '', nota = '', dia = '', propuesta = '', sobre = '', resultado = '' } = {}, { user }) {
    const clean = (value) => String(value || '').trim();
    const result = clean(resultado) && !clean(propuesta) && !clean(veredicto)
      ? await service.recordResult({ user, ref: decision, resultado: clean(resultado), nota: clean(nota) || null })
      : await service.recordVerdict({ user, ref: decision, veredicto, nota: clean(nota) || null, dia: clean(dia) || readingDay, propuesta: clean(propuesta) || null, sobre: clean(sobre) || null });
    // Decisión y resultado en la misma frase («ya lo hice y funcionó»): primero queda la decisión, luego cómo salió.
    if (result.saved && clean(resultado) && clean(veredicto) && typeof service.recordResult === 'function') {
      const outcome = await service.recordResult({ user, ref: result.decision, resultado: clean(resultado), nota: null });
      if (outcome.saved) result.resultado = outcome.resultado;
    }
    return {
      data: {
        ...result,
        instruccion: result.saved
          ? 'Quedó anotado. Dilo de pasada, en tres o cuatro palabras y con tono de colega («Listo, lo de Aristea ya quedó.» o «Anotado.»), y sigue con lo que te pidieron. Nunca «quedó registrada la decisión», nunca «gracias por enseñarme», nunca una explicación de cómo funciona el libro. Queda en tu libro y lo tendrás delante en las próximas conversaciones.'
          : 'No se anotó. Si la persona ya indicó cliente y asunto, consulta lectura_de_la_agencia para localizar esa propuesta y vuelve a anotar con su id. No elijas solo por el nombre del cliente. Pregunta en una sola frase únicamente si sigue ambiguo a cuál decisión se refiere o qué decidió, sin lista de opciones.'
      },
      sources: []
    };
  }
}] : []);
