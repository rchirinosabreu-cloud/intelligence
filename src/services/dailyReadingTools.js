// La memoria del tiempo en el chat (19 de octubre de 2026): Bria responde «¿cómo viene Foobespain?», «¿qué cambió?» o
// «¿qué harías hoy?» con la lectura del día y la historia de esa cuenta o esa persona, foto por foto. Solo lee.
import { isManagerRole } from '../config/security.js';

export const createDailyReadingTools = (service) => (service ? [{
  name: 'lectura_de_la_agencia',
  description: 'La memoria del tiempo de la agencia: la lectura de hoy (qué haría Bria y qué no haría, con las señales que lo sostienen) y, si se pide, la historia día por día de una cuenta (color de la operación, publicadas frente a lo esperado, aprobaciones que esperan, devoluciones, tareas vencidas, horas) o de una persona (abiertas, en proceso, vencidas, devueltas, cerradas y horas del día anterior). Úsala para «¿cómo viene X?», «¿qué cambió?», «¿desde cuándo?», «¿qué harías hoy?» o «¿qué no harías?».',
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
        instruccion: 'Esta es tu memoria del tiempo: una foto por día de cada cuenta y de cada persona, y tu lectura de hoy. Para «cómo viene» compara con su propia historia y di desde cuándo pasa lo que pasa; si la historia es corta, dilo. Cada recomendación va con lo que la sostiene; si algo conviene no hacerlo, dilo con su porqué. Las horas y los cierres de cada foto son los del día anterior. Habla de trabajo, tiempos y carga, nunca un juicio sobre una persona. Solo lees: cualquier cambio lo hace la persona o una acción que ella confirme.'
      },
      sources: data.fecha ? [{ kind: 'lectura', id: data.fecha, label: 'Lectura del día', url: data.cuenta?.enlace || null }] : []
    };
  }
}] : []);
