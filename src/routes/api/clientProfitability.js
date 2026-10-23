import express from 'express';
import { clientProfitabilityService, lastClosedMonth } from '../../services/clientProfitabilityService.js';

// Rentabilidad por cliente (Rodny, 22 de octubre de 2026): solo administradores. Dice cuánto deja cada cuenta y lo
// que cuesta operar la agencia; no es información para todo el equipo. Solo lee.
const isAdmin = (user) => String(user?.role || '').toUpperCase() === 'ADMIN';

export const createClientProfitabilityRouter = ({ service = null, clock = () => new Date() } = {}) => {
  const router = express.Router();
  const adminsOnly = (req, res, next) => {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'La rentabilidad por cliente está disponible solo para administradores.' });
    return next();
  };
  adminsOnly.permission = { role: 'ADMIN' }; // Lo lee el mapa de la plataforma de Bria.
  router.use(adminsOnly);

  router.get('/', async (req, res) => {
    const fallback = lastClosedMonth(clock());
    const year = req.query.year === undefined ? fallback.year : Number(req.query.year);
    const month = req.query.month === undefined ? fallback.month : Number(req.query.month);
    if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Elige un mes y un año válidos.' });
    }
    try {
      return res.json(await (service || clientProfitabilityService()).read({ year, month }));
    } catch (error) {
      console.error('[Client profitability API] No se pudo calcular:', error.response?.data || error);
      return res.status(500).json({ error: 'No se pudo calcular la rentabilidad del mes.' });
    }
  });
  return router;
};
