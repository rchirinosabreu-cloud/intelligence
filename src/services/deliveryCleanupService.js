import { cleanupTaskDeliverables } from './taskDeliverableService.js';
import { cleanupContentDeliveryUploads } from './contentDeliveryService.js';

export async function runDeliveryCleanup({ taskCleanup = cleanupTaskDeliverables, contentCleanup = cleanupContentDeliveryUploads, logger = console } = {}) {
  const [tasks, content] = await Promise.allSettled([Promise.resolve().then(taskCleanup), Promise.resolve().then(contentCleanup)]);
  if (tasks.status === 'rejected') logger.warn('[Entregas] La limpieza de tareas sigue pendiente.');
  if (content.status === 'rejected') logger.warn('[Entregas] La limpieza de piezas sigue pendiente.');
  return { tasks, content };
}

export function startDeliveryCleanup({ run = runDeliveryCleanup, intervalMs = 15 * 60_000 } = {}) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await run(); } catch { console.warn('[Entregas] La limpieza se reintentará.'); }
    finally { running = false; }
  };
  const initial = setTimeout(tick, 15_000), interval = setInterval(tick, intervalMs);
  initial.unref?.(); interval.unref?.();
  return () => { clearTimeout(initial); clearInterval(interval); };
}
