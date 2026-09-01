import {
  getBriaMemoryOverview,
  reconcileBriaMemory,
  searchBriaMemory
} from '../services/briaMemoryService.js';

export const createBriaMemoryOverviewHandler = (loadOverview = getBriaMemoryOverview) => async (_req, res) => {
  try {
    return res.json(await loadOverview());
  } catch (error) {
    console.error('[BriaMemoryController] Error cargando memoria:', error.response?.data || error.message || error);
    return res.status(500).json({ error: 'BRIA_MEMORY_OVERVIEW_FAILED', message: 'No fue posible cargar el estado de la memoria.' });
  }
};

export const createBriaMemorySearchHandler = (search = searchBriaMemory) => async (req, res) => {
  const query = String(req.query?.q || '').trim();
  if (!query) return res.status(400).json({ error: 'BRIA_MEMORY_QUERY_REQUIRED', message: 'Escribe una consulta para probar la memoria.' });
  try {
    const results = await search({ query, limit: req.query?.limit });
    return res.json({ query, results });
  } catch (error) {
    console.error('[BriaMemoryController] Error recuperando memoria:', error.response?.data || error.message || error);
    return res.status(500).json({ error: 'BRIA_MEMORY_SEARCH_FAILED', message: 'No fue posible consultar la memoria de Bria.' });
  }
};

export const createBriaMemorySyncHandler = (reconcile = reconcileBriaMemory) => async (_req, res) => {
  try {
    return res.json(await reconcile());
  } catch (error) {
    console.error('[BriaMemoryController] Error sincronizando memoria:', error.response?.data || error.message || error);
    return res.status(500).json({ error: 'BRIA_MEMORY_SYNC_FAILED', message: 'No fue posible sincronizar la memoria.' });
  }
};

export const overview = createBriaMemoryOverviewHandler();
export const search = createBriaMemorySearchHandler();
export const sync = createBriaMemorySyncHandler();
