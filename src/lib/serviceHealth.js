/**
 * Semáforo de servicios (Rodny, 4 de octubre de 2026): qué servicios externos usa Intelligence y
 * cómo se decide su color. La regla vive aquí una sola vez y la leen el servidor y la pantalla.
 *
 * Cada comprobación guarda un estado crudo —OK, WARN, FAIL o NOT_CONFIGURED— y el color se calcula
 * mirando las últimas: un tropiezo de red no puede poner un servicio en rojo, dos fallos seguidos sí,
 * y lo que no se arregla solo (una clave rechazada, sin crédito) es rojo desde el primero.
 */

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

export const LIGHTS = Object.freeze({ GREEN: 'GREEN', YELLOW: 'YELLOW', RED: 'RED', GRAY: 'GRAY' });

export const CHECK_STATUSES = Object.freeze(['OK', 'WARN', 'FAIL', 'NOT_CONFIGURED']);

/** Margen para el reloj del cron, que nunca cae exacto en el minuto. */
const DUE_TOLERANCE_MS = 30 * 1000;

/** Sin comprobar en tres intervalos seguidos: el que comprueba se detuvo y eso también es noticia. */
const STALE_INTERVALS = 3;

export const SERVICE_CATALOG = Object.freeze([
  {
    id: 'database',
    label: 'Base de datos',
    purpose: 'Guarda todo: tareas, clientes, parrillas, finanzas.',
    impact: 'Si cae, la plataforma entera deja de funcionar.',
    intervalMs: 5 * MIN
  },
  {
    id: 'openai',
    label: 'OpenAI',
    purpose: 'La inteligencia de Bria: minutas, revisiones de parrillas, informes y borradores de cotización.',
    impact: 'Si cae, Bria no responde y las minutas y revisiones esperan en cola hasta que vuelva.',
    intervalMs: 5 * MIN
  },
  {
    id: 'fireflies',
    label: 'Fireflies',
    purpose: 'Graba y transcribe las reuniones.',
    impact: 'Si cae, las minutas nuevas no llegan; las reuniones no se pierden, se recogen cuando vuelve.',
    intervalMs: 5 * MIN
  },
  {
    id: 'google-calendar',
    label: 'Google Calendar y Meet',
    purpose: 'Sincroniza Actividad con el calendario y crea enlaces de Meet.',
    impact: 'Si cae, los eventos nuevos no llegan a Google y no se generan enlaces de Meet.',
    intervalMs: 5 * MIN
  },
  {
    id: 'google-storage',
    label: 'Google Cloud Storage',
    purpose: 'Archivos de clientes, informes, tableros de inspiración y fotos de perfil.',
    impact: 'Si cae, no se pueden subir ni abrir esos archivos.',
    intervalMs: 5 * MIN
  },
  {
    id: 'meta',
    label: 'Meta (Instagram y Facebook)',
    purpose: 'Publicación automática y métricas de las cuentas de los clientes.',
    impact: 'Si cae, las piezas programadas no salen a su hora y los reportes de redes no cargan.',
    intervalMs: 5 * MIN
  },
  {
    id: 'storage-chat',
    label: 'Archivos de tareas y chat',
    purpose: 'Adjuntos de tareas, comentarios, chat del equipo y piezas finales de las parrillas.',
    impact: 'Si cae, no se pueden subir ni descargar adjuntos ni piezas finales.',
    intervalMs: 5 * MIN
  },
  {
    id: 'storage-memory',
    label: 'Memoria de la agencia',
    purpose: 'Minutas automáticas y archivos del Drive interno.',
    impact: 'Si cae, las minutas nuevas no se guardan y el Drive no abre sus archivos.',
    intervalMs: 5 * MIN
  },
  {
    id: 'storage-financial',
    label: 'Soportes financieros',
    purpose: 'Facturas, soportes de movimientos y PDF de cuentas de cobro.',
    impact: 'Si cae, no se pueden subir soportes ni abrir cuentas de cobro guardadas.',
    intervalMs: 5 * MIN
  },
  {
    id: 'email',
    label: 'Correo',
    purpose: 'Recuperación de contraseña y avisos de solicitudes comerciales.',
    impact: 'Si cae, nadie puede recuperar su contraseña y las solicitudes nuevas no avisan por correo.',
    // Cada comprobación inicia sesión en el servidor de correo: con media hora basta y no levanta sospechas.
    intervalMs: 30 * MIN
  },
  {
    id: 'push',
    label: 'Notificaciones push',
    purpose: 'Avisos en el celular y en el navegador.',
    impact: 'Si cae, los avisos siguen en la campana pero no llegan al celular.',
    intervalMs: 15 * MIN
  },
  {
    id: 'trm',
    label: 'TRM (Superfinanciera)',
    purpose: 'Tasa del dólar para cotizaciones y cuentas de cobro en USD.',
    impact: 'Si cae, la TRM hay que escribirla a mano.',
    intervalMs: 60 * MIN
  }
]);

export const serviceById = (id) => SERVICE_CATALOG.find((service) => service.id === id) || null;

const time = (value) => (value instanceof Date ? value : new Date(value)).getTime();

/**
 * El color de un servicio a partir de sus comprobaciones, la más reciente primero.
 * Devuelve `{ light, reason }`; `reason` es una frase para una persona, nunca un código.
 */
export const resolveServiceLight = (checks = [], { now = new Date(), intervalMs = null } = {}) => {
  const [latest, previous] = checks;
  if (!latest) return { light: LIGHTS.GRAY, reason: 'Todavía no se ha comprobado.' };

  if (latest.status === 'NOT_CONFIGURED') {
    return { light: LIGHTS.GRAY, reason: latest.message || 'No está configurado.' };
  }

  if (latest.status === 'FAIL') {
    if (latest.critical || previous?.status === 'FAIL') {
      return { light: LIGHTS.RED, reason: latest.message || 'No responde.' };
    }
    return { light: LIGHTS.YELLOW, reason: `Falló una vez; se vuelve a comprobar. ${latest.message || ''}`.trim() };
  }

  if (intervalMs && time(now) - time(latest.checkedAt) > intervalMs * STALE_INTERVALS) {
    return { light: LIGHTS.YELLOW, reason: 'Hace rato que no se comprueba: el revisor automático puede estar detenido.' };
  }

  if (latest.status === 'WARN') {
    return { light: LIGHTS.YELLOW, reason: latest.message || 'Responde, pero con problemas.' };
  }

  return { light: LIGHTS.GREEN, reason: latest.message || 'Funciona con normalidad.' };
};

const LIGHT_WEIGHT = { [LIGHTS.GRAY]: 0, [LIGHTS.GREEN]: 1, [LIGHTS.YELLOW]: 2, [LIGHTS.RED]: 3 };

/** El color general es el peor de los servicios configurados; si ninguno lo está, gris. */
export const overallLight = (lights = []) => lights.reduce(
  (worst, light) => (LIGHT_WEIGHT[light] > LIGHT_WEIGHT[worst] ? light : worst),
  LIGHTS.GRAY
);

export const isServiceDue = (service, lastCheckedAt, now = new Date()) => {
  if (!lastCheckedAt) return true;
  return time(now) - time(lastCheckedAt) >= service.intervalMs - DUE_TOLERANCE_MS;
};

const STATUS_WEIGHT = { NOT_CONFIGURED: 0, OK: 1, WARN: 2, FAIL: 3 };

/**
 * Cuándo se avisa (Rodny, 5 de octubre de 2026): al pasar a rojo y al salir de rojo, nada más. Un
 * amarillo no avisa —puede ser un tropiezo de red— y pasar a «sin configurar» no es una recuperación.
 */
export const lightTransition = (before, after) => {
  if (after === LIGHTS.RED && before !== LIGHTS.RED) return 'DOWN';
  if (before === LIGHTS.RED && (after === LIGHTS.GREEN || after === LIGHTS.YELLOW)) return 'RECOVERED';
  return null;
};

/** Veinticuatro casillas, una por hora, con el peor estado de esa hora; `null` si no hubo comprobación. */
export const hourlyHistory = (checks = [], { now = new Date(), hours = 24 } = {}) => {
  const end = time(now);
  const buckets = Array.from({ length: hours }, (_, index) => ({
    start: new Date(end - (hours - index) * HOUR).toISOString(),
    status: null
  }));
  for (const item of checks) {
    const age = end - time(item.checkedAt);
    if (age < 0 || age >= hours * HOUR) continue;
    const bucket = buckets[hours - 1 - Math.floor(age / HOUR)];
    if (bucket.status === null || STATUS_WEIGHT[item.status] > STATUS_WEIGHT[bucket.status]) bucket.status = item.status;
  }
  return buckets;
};

/** Lo que significa una respuesta HTTP fallida, en una frase. `critical` = no se arregla esperando. */
export const classifyHttpFailure = (status, { code = null } = {}) => {
  const errorCode = `HTTP_${status}`;
  if (status === 401) return { critical: true, errorCode, message: 'La clave fue rechazada: hay que revisar la credencial.' };
  if (status === 403) return { critical: true, errorCode, message: 'La credencial no tiene permiso para esto.' };
  if (status === 429 && code === 'insufficient_quota') {
    return { critical: true, errorCode: 'INSUFFICIENT_QUOTA', message: 'Se acabó el crédito de la cuenta: hay que recargar.' };
  }
  if (status === 429) return { critical: false, errorCode, message: 'El proveedor está limitando las peticiones.' };
  if (status === 404) return { critical: true, errorCode, message: 'El recurso no existe: revisar la configuración.' };
  if (status >= 500) return { critical: false, errorCode, message: 'El proveedor tiene una falla de su lado.' };
  return { critical: false, errorCode, message: `El proveedor respondió con un error (${status}).` };
};

export const classifyNetworkFailure = (error) => {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return { critical: false, errorCode: 'TIMEOUT', message: 'No respondió a tiempo.' };
  }
  return { critical: false, errorCode: 'NETWORK', message: 'No se pudo conectar.' };
};
