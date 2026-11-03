import express from 'express';
import { getPlatformLeagueService } from '../../services/platformLeagueService.js';

/**
 * La liga del mes (2 de noviembre de 2026): la liga de quien pregunta, con la carrera de todo el equipo, y el
 * regalo de cinco puntos de la semana. Para todo el equipo autenticado: lo que se ve de los demás es solo su
 * puntaje; el detalle de cada día es de cada quien y viaja solo en lo propio.
 */
export function createPlatformLeagueRouter({ service = getPlatformLeagueService } = {}) {
  const router = express.Router();
  const svc = () => (typeof service === 'function' ? service() : service);
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.user?.userId) return res.status(401).json({ error: 'Inicia sesión.' });
    next();
  });
  const handle = (fallback, run) => async (req, res) => {
    try {
      res.json(await run(req));
    } catch (error) {
      if (error?.statusCode && error.statusCode < 500) return res.status(error.statusCode).json({ error: error.message, code: error.code });
      console.error('[Liga]', fallback, error?.response?.data || error?.message || error);
      res.status(500).json({ error: fallback });
    }
  };
  router.get('/', handle('No pudimos cargar la liga.', (req) => svc().leagueFor({ userId: req.user.userId })));
  router.get('/recognitions', handle('No pudimos cargar tus logros.', (req) => svc().recognitionsFor({ userId: req.user.userId })));
  router.post('/kudos', handle('No pudimos registrar el regalo.', (req) => svc().giveKudos({ userId: req.user.userId, memberId: req.body?.memberId, note: req.body?.note })));
  router.post('/meetings', handle('No pudimos registrar la reunión.', (req) => svc().awardMeeting({ userId: req.user.userId, memberId: req.body?.memberId, day: req.body?.day })));
  return router;
}
