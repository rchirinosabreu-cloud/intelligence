// El health score en Salud operativa (Rodny, 14 de noviembre de 2026). La regla es la del medidor
// (`scripts/health-score.mjs`): aquí solo se reúne lo medido y se entrega a la pantalla.
//
// Lo que se lee del código viene de la medición que viaja con la versión publicada (`health-score-snapshot.json`,
// que escribe el Dockerfile al construir, con las vulnerabilidades consultadas en ese momento). Sin ella —en local—
// se lee el código una vez. Las rutas se leen del servidor que está corriendo y lo que confirmó una persona, de su
// archivo. El código no cambia mientras el servidor corre, así que lo leído se guarda mientras dure el proceso.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANUAL_ENTRIES_FILE, SNAPSHOT_FILE, averageScore, collectFacts, evaluateAreas } from '../../scripts/health-score.mjs';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const readJson = (file) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
};

export const createPlatformHealthScoreService = ({ root = ROOT, readFacts = collectFacts, routes = () => null, now = () => new Date(), logger = console } = {}) => {
  let measured = null;
  const measure = () => {
    if (measured) return measured;
    const snapshot = readJson(path.join(root, SNAPSHOT_FILE));
    measured = snapshot?.facts
      ? { facts: snapshot.facts, measuredAt: snapshot.generatedAt }
      : { facts: readFacts(root), measuredAt: now().toISOString() };
    return measured;
  };
  const liveRoutes = () => {
    try { return routes() || null; } catch (error) { logger.error('[HealthScore] No se pudieron leer las rutas:', error.message); return null; }
  };

  return {
    async read() {
      const { facts, measuredAt } = measure();
      const manual = readJson(path.join(root, MANUAL_ENTRIES_FILE)) || {};
      const areas = evaluateAreas({ ...facts, routes: liveRoutes() }, manual, bogotaDate(now()));
      return {
        measuredAt,
        average: averageScore(areas),
        met: areas.reduce((sum, area) => sum + area.met, 0),
        total: areas.reduce((sum, area) => sum + area.total, 0),
        areas
      };
    }
  };
};
