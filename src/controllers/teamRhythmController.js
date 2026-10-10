import { teamRhythmService } from '../services/teamRhythmService.js';
import { teamLoadService } from '../services/teamLoadService.js';
import { getWeeklyReadingService } from '../services/weeklyReadingService.js';

// Ritmo del equipo (9 de octubre de 2026): la lectura por persona del cronómetro. Detrás de la misma puerta que el
// resto de Manager: módulo Manager y rol de administrador o project manager.
export const createTeamRhythmHandler = (service = teamRhythmService) => async (req, res) => {
  try {
    return res.json(await service.get({ days: Number(req.query?.days) }));
  } catch (error) {
    console.error('[TeamRhythm] No se pudo calcular el ritmo del equipo:', error?.message || error);
    return res.status(500).json({ error: 'No pudimos calcular el ritmo del equipo. Intenta de nuevo.' });
  }
};

// Fase A (10 de octubre de 2026): mapa de carga y lectura de la semana, misma puerta.
export const createTeamLoadHandler = (service = teamLoadService) => async (_req, res) => {
  try {
    return res.json(await service.get());
  } catch (error) {
    console.error('[TeamLoad] No se pudo armar el mapa de carga:', error?.message || error);
    return res.status(500).json({ error: 'No pudimos armar el mapa de carga. Intenta de nuevo.' });
  }
};

export const createWeeklyReadingReadHandler = (service = getWeeklyReadingService) => async (_req, res) => {
  try {
    return res.json(await (typeof service === 'function' ? service() : service).current());
  } catch (error) {
    console.error('[WeeklyReading] No se pudo leer la lectura de la semana:', error?.message || error);
    return res.status(500).json({ error: 'No pudimos cargar la lectura de la semana. Intenta de nuevo.' });
  }
};

export const createWeeklyReadingGenerateHandler = (service = getWeeklyReadingService) => async (req, res) => {
  try {
    const actor = { ref: req.user?.userId || req.user?.id || 'desconocido', name: req.user?.name || 'Dirección' };
    return res.json(await (typeof service === 'function' ? service() : service).generate({ actor, trigger: 'MANUAL' }));
  } catch (error) {
    console.error('[WeeklyReading] No se pudo generar la lectura de la semana:', error?.message || error);
    return res.status(502).json({ error: 'Bria no pudo escribir la lectura en este momento. Intenta de nuevo en unos minutos.' });
  }
};

export const getTeamRhythm = createTeamRhythmHandler();
export const getTeamLoad = createTeamLoadHandler();
export const getWeeklyReading = createWeeklyReadingReadHandler();
export const generateWeeklyReading = createWeeklyReadingGenerateHandler();
