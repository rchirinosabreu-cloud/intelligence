// La memoria del tiempo en el chat (19 de octubre de 2026): Bria responde «¿cómo viene Foobespain?», «¿qué cambió?» o
// «¿qué harías hoy?» con la lectura del día y la historia de esa cuenta o esa persona, foto por foto. Solo lee.
// El libro de decisiones (mismo día): cuando la persona cuenta qué hizo con una decisión de la lectura, Bria lo anota
// con sus palabras; nunca pregunta como un formulario.
import { isManagerRole } from '../config/security.js';

export const createDailyReadingTools = (service) => (service ? [{
  name: 'lectura_de_la_agencia',
  description: 'La memoria del tiempo de la agencia: la lectura de hoy (qué haría Bria y qué no haría, numerado, con las señales que lo sostienen y qué ya se anotó de cada decisión), el libro de decisiones (cuántas se propusieron, cuántas se hicieron o descartaron y cómo salieron) y, si se pide, la historia día por día de una cuenta (color de la operación, publicadas frente a lo esperado, aprobaciones que esperan, devoluciones, tareas vencidas, horas) o de una persona (abiertas, en proceso, vencidas, devueltas, cerradas y horas del día anterior). Úsala para «¿cómo viene X?», «¿qué cambió?», «¿desde cuándo?», «¿qué harías hoy?», «¿qué no harías?» o «¿cómo vas acertando?».',
  parameters: { type: 'object', properties: {
    cliente: { type: 'string', description: 'Nombre de la cuenta, si preguntan por una. Vacío si no.' },
    persona: { type: 'string', description: 'Nombre de la persona del equipo, si preguntan por alguien. Vacío si no.' },
    dias: { type: 'integer', enum: [7, 14, 30], description: 'Cuántos días de historia; 14 por defecto.' }
  } },
  allowed: (user) => isManagerRole(user?.role),
  async run({ cliente = '', persona = '', dias = 14 } = {}, { user }) {
    const data = await service.explain({ user, cliente, persona, days: dias });
    return {
      data: {
        ...data,
        instruccion: 'Esta es tu memoria del tiempo: una foto por día de cada cuenta y de cada persona, y tu lectura de hoy. Para «cómo viene» compara con su propia historia y di desde cuándo pasa lo que pasa; si la historia es corta, dilo. Cada recomendación va con lo que la sostiene; si algo conviene no hacerlo, dilo con su porqué. Las horas y los cierres de cada foto son los del día anterior. Habla de trabajo, tiempos y carga, nunca un juicio sobre una persona. El libro de decisiones mide tus decisiones, no a las personas: si preguntan cómo vas, di la lectura con sus cifras y qué aprendiste. Solo lees: cualquier cambio lo hace la persona o una acción que ella confirme.'
      },
      sources: data.fecha ? [{ kind: 'lectura', id: data.fecha, label: 'Lectura del día', url: data.cuenta?.enlace || null }] : []
    };
  }
}, {
  name: 'anotar_decision',
  description: 'Anota en el libro de decisiones lo que la persona decidió sobre una de las decisiones de la lectura de la mañana, cuando lo cuenta con sus palabras («ya le escribí a Gema», «eso no lo voy a hacer», «la de Aristea la dejo para la otra semana»). Nunca lo preguntes como formulario: anótalo cuando salga en la conversación. Si no está claro a cuál decisión se refiere o qué decidió, la herramienta lo dice y tú preguntas en una frase.',
  parameters: { type: 'object', properties: {
    decision: { type: 'string', description: 'A cuál decisión se refiere: su número en la lectura («2»), su id, o una palabra única de su título («Foobespain»).' },
    veredicto: { type: 'string', description: 'Qué decidió, con sus palabras: «la hice», «no», «después», «la semana que viene»…' },
    nota: { type: 'string', description: 'Si dijo por qué, su motivo en pocas palabras (máximo 300 caracteres). Vacío si no.' },
    dia: { type: 'string', description: 'Día de la lectura (AAAA-MM-DD) si no es la última. Vacío para la última.' }
  }, required: ['decision', 'veredicto'] },
  allowed: (user) => isManagerRole(user?.role),
  async run({ decision, veredicto, nota = '', dia = '' } = {}, { user }) {
    const result = await service.recordVerdict({ user, ref: decision, veredicto, nota: String(nota || '').trim() || null, dia: String(dia || '').trim() || null });
    return {
      data: {
        ...result,
        instruccion: result.saved
          ? 'Quedó anotado. Dilo de pasada, en tres o cuatro palabras y con tono de colega («Listo, lo de Aristea ya quedó.» o «Anotado.»), y sigue con lo que te pidieron. Nunca «quedó registrada la decisión», nunca «gracias por enseñarme», nunca una explicación de cómo funciona el libro. Mañana la lectura dirá qué pasó con esa decisión.'
          : 'No se anotó: pregunta en una sola frase lo que falta (a cuál decisión se refiere, o qué decidió), sin lista de opciones.'
      },
      sources: []
    };
  }
}] : []);
