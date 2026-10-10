import { teamRhythmService } from '../services/teamRhythmService.js';

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

export const getTeamRhythm = createTeamRhythmHandler();
