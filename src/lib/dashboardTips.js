// Consejos y recordatorios personalizados del dashboard (Rodny, 18 de septiembre de 2026).
// Lógica pura: elige, para una persona y un día (Bogotá), un consejo ligado a su situación real
// (vencidas, devoluciones, reunión de hoy, seguimientos del CRM...). Si no hay nada de eso, algunos
// días muestra un consejo de plataforma; otros días, ninguno. Nunca inventa datos: solo lee el payload.

const BOGOTA = 'America/Bogota';

export const bogotaDayKey = (value = new Date()) => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: BOGOTA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
  } catch {
    return null;
  }
};

const dayNumber = (dayKey) => Math.floor(Date.parse(`${dayKey}T00:00:00Z`) / 86400000);

const hashText = (text) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

const timeOf = (value) => {
  try {
    return new Intl.DateTimeFormat('es-CO', { timeZone: BOGOTA, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
  } catch {
    return '';
  }
};

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

const canUse = (user, moduleKey) => {
  if (!moduleKey) return true;
  if (String(user?.role || '').toUpperCase() === 'ADMIN') return true;
  return user?.modulePermissions?.[moduleKey] === true;
};

/** Consejos que dependen de lo que la persona tiene entre manos hoy. */
const contextualTips = ({ dashboard, user }) => {
  const stats = dashboard?.stats || {};
  const tips = [];

  if (stats.overdue > 0) {
    tips.push({
      id: 'overdue', kind: 'reminder',
      title: `Tienes ${plural(stats.overdue, 'tarea vencida', 'tareas vencidas')}`,
      body: 'Si una fecha ya no se puede cumplir, muévela hoy y deja un comentario con el motivo: el equipo prefiere saberlo a tiempo.',
      actionLabel: 'Ver en Gestión', actionUrl: '/gestion', moduleKey: 'gestion'
    });
  }
  if (stats.returned > 0) {
    tips.push({
      id: 'returned', kind: 'reminder',
      title: `${plural(stats.returned, 'tarea devuelta', 'tareas devueltas')} por corregir`,
      body: 'Una devolución se cierra más rápido cuando respondes el comentario con lo que cambiaste. Así la racha de calidad del equipo vuelve a subir.',
      actionLabel: 'Corregir ahora', actionUrl: '/gestion?showReturned=true', moduleKey: 'gestion'
    });
  }
  const meetingToday = (dashboard?.meetings || []).find((meeting) => meeting.isToday);
  if (meetingToday) {
    tips.push({
      id: 'meeting-today', kind: 'reminder',
      title: `Hoy tienes «${meetingToday.title}» a las ${timeOf(meetingToday.startAt)}`,
      body: 'Antes de entrar, repasa la minuta anterior y los acuerdos pendientes de ese cliente: llegar con contexto acorta la reunión.',
      actionLabel: 'Ver minutas', actionUrl: '/minutas', moduleKey: 'minutas'
    });
  }
  const crm = dashboard?.crmAttention;
  if (crm?.enabled && crm.counts?.overdue > 0) {
    tips.push({
      id: 'crm-overdue', kind: 'reminder',
      title: `${plural(crm.counts.overdue, 'seguimiento comercial vencido', 'seguimientos comerciales vencidos')}`,
      body: 'Una llamada corta o un mensaje directo reactiva más oportunidades que un tercer correo. Registra la gestión en el CRM para que el semáforo se actualice.',
      actionLabel: 'Abrir CRM', actionUrl: '/crm', moduleKey: 'crm'
    });
  }
  if (stats.dueToday >= 3) {
    tips.push({
      id: 'due-today', kind: 'tip',
      title: `Hoy vencen ${stats.dueToday} tareas`,
      body: 'Empieza por la prioritaria y marca cada una como realizada al terminar: los logros del día se ven en el equipo al instante.',
      actionLabel: 'Ver mis tareas', actionUrl: '/gestion', moduleKey: 'gestion'
    });
  }
  if (stats.completedToday >= 5) {
    tips.push({
      id: 'good-pace', kind: 'tip',
      title: `Buen ritmo: ${stats.completedToday} logros hoy`,
      body: 'Ocho tareas distintas en el día encienden el reconocimiento «On fire». Cuida la calidad: una devolución cuenta más que una tarea extra.',
      actionLabel: null, actionUrl: null
    });
  }
  return tips.filter((tip) => canUse(user, tip.moduleKey));
};

/** Consejos de plataforma, para días tranquilos. */
export const PLATFORM_TIPS = Object.freeze([
  { id: 'mentions', kind: 'tip', title: 'Menciona con @ en los comentarios', body: 'Escribir @ y el nombre en cualquier comentario avisa a esa persona al momento, sin salir de la tarea.', actionLabel: null, actionUrl: null, moduleKey: 'gestion' },
  { id: 'attachments', kind: 'tip', title: 'Adjunta hasta 10 archivos por comentario', body: 'Texto y archivos viajan juntos al pulsar Enviar, con un límite de 25 MB por mensaje. Nada se pierde si algo falla: el borrador se conserva.', actionLabel: null, actionUrl: null, moduleKey: 'gestion' },
  { id: 'context-comment', kind: 'tip', title: 'Crea tareas con contexto', body: 'Un primer comentario con lo necesario para empezar evita idas y vueltas. Las tareas sin contexto son la primera causa de devoluciones.', actionLabel: null, actionUrl: null, moduleKey: 'gestion' },
  { id: 'calendar-sync', kind: 'tip', title: 'Tu agenda vive en Actividad', body: 'Las reuniones de Google Calendar donde te citan aparecen aquí y en Actividad, con el enlace de Meet listo para entrar.', actionLabel: 'Abrir Actividad', actionUrl: '/actividad', moduleKey: 'actividad' },
  { id: 'announcements', kind: 'tip', title: 'Los anuncios duran una semana', body: 'El tablero muestra solo la semana actual; lo anterior sigue en «Ver historial de anuncios». Nada se borra al cambiar de semana.', actionLabel: null, actionUrl: null },
  { id: 'achievements-history', kind: 'tip', title: 'Revisa cualquier día en el historial de logros', body: 'Desde «Ver historial completo» puedes buscar por tarea, cliente o fecha y ver qué reconocimientos se ganaron.', actionLabel: null, actionUrl: null },
  { id: 'profile-photo', kind: 'tip', title: 'Pon tu foto de perfil', body: 'Desde tu perfil puedes subirla y encuadrarla con zoom. Tu anillo de color te acompaña en toda la plataforma.', actionLabel: 'Ir a mi perfil', actionUrl: '/perfil' },
  { id: 'bria-review', kind: 'tip', title: 'Bria revisa tus parrillas antes del cliente', body: 'Una revisión con Bria detecta hallazgos con evidencia; corregirlos antes de compartir la parrilla ahorra una ronda de aprobación.', actionLabel: 'Abrir Parrillas', actionUrl: '/parrillas', moduleKey: 'parrillas' },
  { id: 'crm-light', kind: 'tip', title: 'El semáforo del CRM se calcula solo', body: 'Cada oportunidad pasa a rojo tras 7 días de seguimiento vencido o 21 sin gestión. Registrar cada contacto mantiene el color al día.', actionLabel: 'Abrir CRM', actionUrl: '/crm', moduleKey: 'crm' }
]);

/**
 * Elige el consejo del día para una persona. Devuelve `null` cuando no toca mostrar ninguno.
 * - Con situación real (vencidas, devoluciones, reunión hoy, CRM vencido): siempre uno, rotando por día.
 * - Sin situación: un consejo de plataforma dos de cada tres días, rotando por persona y día.
 */
export const pickDashboardTip = ({ dashboard, user, now = new Date(), dismissedIds = [] } = {}) => {
  const dayKey = bogotaDayKey(now);
  if (!dayKey) return null;
  const seed = hashText(`${user?.id || user?.userId || 'anon'}:${dayKey}`);
  const day = dayNumber(dayKey);

  const contextual = contextualTips({ dashboard, user }).filter((tip) => !dismissedIds.includes(tip.id));
  if (contextual.length > 0) {
    return { ...contextual[seed % contextual.length], dayKey };
  }

  if (day % 3 === 0) return null;
  const generic = PLATFORM_TIPS.filter((tip) => canUse(user, tip.moduleKey) && !dismissedIds.includes(tip.id));
  if (generic.length === 0) return null;
  return { ...generic[seed % generic.length], dayKey };
};
