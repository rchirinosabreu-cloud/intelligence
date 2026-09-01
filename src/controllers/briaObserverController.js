import {
  getObserverInbox,
  reconcileBriaObserver,
  updateObserverSignalStatus
} from '../services/briaObserverService.js';

export const createObserverInboxHandler = (loadInbox = getObserverInbox) => async (req, res) => {
  try {
    return res.json(await loadInbox({ status: req.query?.status, limit: req.query?.limit }));
  } catch (error) {
    console.error('[BriaObserverController] Error cargando señales:', error.response?.data || error.message || error);
    return res.status(500).json({ error: 'BRIA_OBSERVER_INBOX_FAILED', message: 'No fue posible cargar las señales de Bria.' });
  }
};

export const createObserverSyncHandler = (reconcile = reconcileBriaObserver) => async (_req, res) => {
  try {
    return res.json(await reconcile());
  } catch (error) {
    console.error('[BriaObserverController] Error escaneando fuentes:', error.response?.data || error.message || error);
    return res.status(500).json({ error: 'BRIA_OBSERVER_SYNC_FAILED', message: 'No fue posible completar el escaneo del Observer.' });
  }
};

export const createObserverTransitionHandler = (transition = updateObserverSignalStatus) => async (req, res) => {
  try {
    const signal = await transition({
      id: req.params.id,
      action: req.body?.action,
      snoozedUntil: req.body?.snoozedUntil,
      actorId: req.user?.id
    });
    return res.json({ signal });
  } catch (error) {
    console.error('[BriaObserverController] Error actualizando señal:', error.response?.data || error.message || error);
    if (['INVALID_OBSERVER_ACTION', 'INVALID_SNOOZE_UNTIL'].includes(error.message)) {
      return res.status(400).json({ error: error.message, message: 'La acción solicitada no es válida.' });
    }
    return res.status(500).json({ error: 'BRIA_OBSERVER_TRANSITION_FAILED', message: 'No fue posible actualizar la señal.' });
  }
};

export const inbox = createObserverInboxHandler();
export const sync = createObserverSyncHandler();
export const transition = createObserverTransitionHandler();
