// Ritmo del equipo (Rodny, 9 de octubre de 2026): cuánto tarda cada persona por tipo de trabajo, qué tan parejo
// trabaja y dónde se le va el tiempo. «Si Brayan hace en un día dos vídeos y en cada uno se demora 4 horas …
// o si en un vídeo se demora 5 horas y en otro 30 minutos, hay que ver por qué tanta diferencia».
//
// Lógica pura: recibe tareas cerradas ya resumidas (tiempo medido, retrabajo, sesión más larga) y devuelve, por
// persona y por tipo de trabajo, cifras y hallazgos. Cada hallazgo es una pregunta para mirar, con las tareas que
// lo sustentan; nunca un veredicto. Tres cosas que no se negocian:
//   - lo que no se midió no es rápido: primero se dice cuánto de lo cerrado tiene tiempo (cobertura);
//   - un reloj olvidado (una sesión de más de 8 h) no cuenta como trabajo: se avisa aparte;
//   - solo se compara con el equipo cuando hay tareas suficientes de los dos lados.

const H = 3_600_000, M = 60_000;
export const RHYTHM_LIMITS = Object.freeze({
  minMeasuredMs: 10 * M,       // Menos de esto es un clic, no una medición.
  forgottenSessionMs: 8 * H,   // Una sola sesión así es un reloj que nadie pausó.
  lowCoverage: 0.5,            // Menos de la mitad medida: sus tiempos no se pueden leer.
  minClosedForCoverage: 3,
  minOwnToCompare: 3,
  minTeamToCompare: 3,
  slowerRatio: 1.5,
  fasterRatio: 0.5,
  unevenRatio: 4,              // La más larga es cuatro veces la más corta.
  heavyDayMs: 6 * H,           // Varias tareas del mismo tipo el mismo día que suman esto.
  longDayMs: 10 * H,           // Un día con esto medido, sea cual sea el trabajo.
  manyTasks: 5,                // Desde aquí no se habla de la dispersión, sino de las tareas fuera de lo habitual.
  outlierRatio: 3,
  outlierMinMs: 2 * H,
  reworkMinMs: 1 * H,
  reworkShare: 0.4
});

// Solo se compara trabajo homogéneo. «Operaciones & Reuniones» es la categoría de relleno del clasificador y
// «Marketing & Social Media» mezcla redactar una parrilla con responder mensajes: compararlas entre personas
// diría cosas falsas. Los formatos de pieza sí son el mismo trabajo.
const COMPARABLE = new Set(['Reel', 'Carrusel', 'Post', 'Video', 'Historia', 'Publicación', 'Producción Audiovisual', 'Creativo & Diseño', 'Creación de Contenido']);
export const isComparableWork = (workType) => COMPARABLE.has(workType);

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const dayLabel = (day) => { const [, m, d] = String(day).split('-').map(Number); return m && d ? `${d} de ${MONTHS[m - 1]}` : String(day); };
export const formatDuration = (ms) => {
  const minutes = Math.round(ms / M);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60), rest = minutes % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
};
const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};
const quote = (text) => `«${String(text || 'Sin título').slice(0, 50)}»`;

const isForgotten = (t) => (t.longestSessionMs || 0) >= RHYTHM_LIMITS.forgottenSessionMs;
const isMeasured = (t) => !isForgotten(t) && (t.measuredMs || 0) >= RHYTHM_LIMITS.minMeasuredMs;

export const analyzeTeamRhythm = ({ tasks = [] } = {}) => {
  const measured = tasks.filter(isMeasured);
  const byPerson = new Map();
  for (const t of tasks) {
    if (!t.personId) continue;
    if (!byPerson.has(t.personId)) byPerson.set(t.personId, { personId: t.personId, personName: String(t.personName || '').trim() || 'Sin nombre', tasks: [] });
    byPerson.get(t.personId).tasks.push(t);
  }

  const types = [...new Set(measured.map((t) => t.workType))].map((workType) => {
    const rows = measured.filter((t) => t.workType === workType);
    return { workType, measured: rows.length, people: new Set(rows.map((t) => t.personId)).size, medianMs: median(rows.map((t) => t.measuredMs)) };
  }).sort((a, b) => b.measured - a.measured);

  const people = [...byPerson.values()].map(({ personId, personName, tasks: own }) => {
    const ok = own.filter(isMeasured);
    const findings = [];
    const closed = own.length;
    const coverage = closed ? ok.length / closed : 0;

    if (closed >= RHYTHM_LIMITS.minClosedForCoverage && coverage < RHYTHM_LIMITS.lowCoverage) {
      findings.push({ kind: 'LOW_COVERAGE', severity: 'warning', taskIds: own.filter((t) => !isMeasured(t) && !isForgotten(t)).map((t) => t.id).slice(0, 12),
        message: `De ${closed} tareas cerradas, ${ok.length} tienen tiempo medido: las demás pasaron a Realizada sin pasar por En proceso. Sin eso, sus tiempos no se pueden leer.` });
    }

    const forgotten = own.filter(isForgotten);
    if (forgotten.length) {
      findings.push({ kind: 'FORGOTTEN_CLOCK', severity: 'info', taskIds: forgotten.map((t) => t.id),
        message: `${forgotten.length === 1 ? `En ${quote(forgotten[0].title)} hubo` : `En ${forgotten.length} tareas hubo`} una sesión de más de ${formatDuration(RHYTHM_LIMITS.forgottenSessionMs)}: parece un reloj que nadie pausó y no se cuenta como trabajo.` });
    }

    const overlapped = own.filter((t) => (t.overlappedMs || 0) >= RHYTHM_LIMITS.minMeasuredMs);
    const overlappedMs = overlapped.reduce((s, t) => s + t.overlappedMs, 0);
    if (overlappedMs >= RHYTHM_LIMITS.reworkMinMs) {
      findings.push({ kind: 'OVERLAP', severity: 'info', taskIds: overlapped.map((t) => t.id).slice(0, 12),
        message: `En ${overlapped.length} ${overlapped.length === 1 ? 'tarea' : 'tareas'} el reloj de ${personName} corrió a la vez que en otra: ${formatDuration(overlappedMs)} que no se suman, para no contar dos veces el mismo tiempo.` });
    }

    const byType = [...new Set(ok.map((t) => t.workType))].map((workType) => {
      const rows = ok.filter((t) => t.workType === workType).sort((a, b) => b.measuredMs - a.measuredMs);
      const values = rows.map((t) => t.measuredMs);
      const entry = { workType, measured: rows.length, medianMs: median(values), minMs: Math.min(...values), maxMs: Math.max(...values), totalMs: values.reduce((s, v) => s + v, 0), comparable: isComparableWork(workType) };
      if (!entry.comparable) return entry;

      // Pocas tareas muy distintas entre sí (5 h y 30 min): se nombran las dos.
      const slow = rows[0], fast = rows.at(-1);
      if (rows.length >= 2 && rows.length < RHYTHM_LIMITS.manyTasks && fast.measuredMs > 0 && slow.measuredMs / fast.measuredMs >= RHYTHM_LIMITS.unevenRatio) {
        findings.push({ kind: 'UNEVEN', severity: 'warning', workType, taskIds: [slow.id, fast.id],
          message: `Sus ${rows.length} tareas de ${workType} medidas van de ${formatDuration(fast.measuredMs)} a ${formatDuration(slow.measuredMs)} (mediana ${formatDuration(entry.medianMs)}). Vale la pena ver qué cambió entre ${quote(slow.title)} y ${quote(fast.title)}.` });
      }
      // Con muchas, la dispersión no es noticia: se nombran las que tardaron varias veces lo habitual.
      if (rows.length >= RHYTHM_LIMITS.manyTasks) {
        const outliers = rows.filter((t) => t.measuredMs >= RHYTHM_LIMITS.outlierMinMs && t.measuredMs >= RHYTHM_LIMITS.outlierRatio * entry.medianMs).slice(0, 3);
        if (outliers.length) {
          findings.push({ kind: 'OUTLIER', severity: 'warning', workType, taskIds: outliers.map((t) => t.id),
            message: `En ${workType} suele tardar ${formatDuration(entry.medianMs)}, pero ${outliers.length === 1 ? `${quote(outliers[0].title)} tomó ${formatDuration(outliers[0].measuredMs)}` : `${outliers.length} tareas tomaron ${outliers.map((t) => formatDuration(t.measuredMs)).join(', ')}`}. ¿Qué tuvieron de distinto?` });
        }
      }

      // Contra el resto del equipo en el mismo tipo de trabajo.
      const others = measured.filter((t) => t.workType === workType && t.personId !== personId).map((t) => t.measuredMs);
      if (rows.length >= RHYTHM_LIMITS.minOwnToCompare && others.length >= RHYTHM_LIMITS.minTeamToCompare) {
        const team = median(others);
        entry.teamMedianMs = team;
        const ratio = team ? entry.medianMs / team : 1;
        if (ratio >= RHYTHM_LIMITS.slowerRatio) {
          findings.push({ kind: 'SLOWER_THAN_TEAM', severity: 'warning', workType, taskIds: rows.slice(0, 5).map((t) => t.id),
            message: `En ${workType}, la mediana de ${personName} es ${formatDuration(entry.medianMs)} y la del resto del equipo ${formatDuration(team)}. ¿Le tocan piezas más complejas o algo lo frena?` });
        } else if (ratio <= RHYTHM_LIMITS.fasterRatio) {
          findings.push({ kind: 'FASTER_THAN_TEAM', severity: 'info', workType, taskIds: rows.slice(-5).map((t) => t.id),
            message: `En ${workType}, la mediana de ${personName} es ${formatDuration(entry.medianMs)} y la del resto del equipo ${formatDuration(team)}. ¿Trabaja distinto, o hay tiempo que no se está midiendo?` });
        }
      }
      return entry;
    }).sort((a, b) => b.measured - a.measured);

    // Días cargados: varias tareas del mismo tipo el mismo día que suman mucho.
    const days = new Map();
    for (const t of ok) {
      const key = `${t.completedDay}|${t.workType}`;
      days.set(key, [...(days.get(key) || []), t]);
    }
    for (const [key, rows] of days) {
      const total = rows.reduce((s, t) => s + t.measuredMs, 0);
      if (isComparableWork(rows[0].workType) && rows.length >= 2 && total >= RHYTHM_LIMITS.heavyDayMs) {
        const [day, workType] = key.split('|');
        findings.push({ kind: 'HEAVY_DAY', severity: 'warning', workType, day, taskIds: rows.map((t) => t.id),
          message: `${personName} cerró ${rows.length} tareas de ${workType} el ${dayLabel(day)} y entre todas suman ${formatDuration(total)}. ¿Fue un día atípico o algo las alargó?` });
      }
    }

    // Día largo: mucho tiempo medido en un solo día, sea cual sea el trabajo.
    const perDay = new Map();
    for (const t of ok) perDay.set(t.completedDay, [...(perDay.get(t.completedDay) || []), t]);
    for (const [day, rows] of perDay) {
      const total = rows.reduce((s, t) => s + t.measuredMs, 0);
      if (total >= RHYTHM_LIMITS.longDayMs) {
        findings.push({ kind: 'LONG_DAY', severity: 'warning', day, taskIds: rows.map((t) => t.id),
          message: `El ${dayLabel(day)} se midieron ${formatDuration(total)} de trabajo de ${personName} en ${rows.length} ${rows.length === 1 ? 'tarea' : 'tareas'}. ¿Se quedó trabajando de más o quedó un reloj corriendo?` });
      }
    }

    // Retrabajo: tiempo después de una devolución.
    const rework = ok.filter((t) => (t.reworkMs || 0) >= RHYTHM_LIMITS.reworkMinMs && t.reworkMs / t.measuredMs >= RHYTHM_LIMITS.reworkShare);
    if (rework.length) {
      const top = rework.sort((a, b) => b.reworkMs - a.reworkMs)[0];
      const share = top.reworkMs >= top.measuredMs ? `todo su tiempo medido (${formatDuration(top.measuredMs)}) fue` : `${formatDuration(top.reworkMs)} de ${formatDuration(top.measuredMs)} fueron`;
      findings.push({ kind: 'REWORK', severity: 'warning', taskIds: rework.map((t) => t.id),
        message: `${rework.length === 1 ? 'En' : `En ${rework.length} tareas el retrabajo pesa; en`} ${quote(top.title)}, ${share} después de una devolución.` });
    }

    // Cuántas de las medidas son estimaciones que la persona dio al cerrar sin reloj (9 de octubre de 2026).
    const declared = ok.filter((t) => (t.declaredMs || 0) > 0 && t.declaredMs >= t.measuredMs / 2).length;
    return { personId, personName, closed, measured: ok.length, declared, coverage, measuredMs: ok.reduce((s, t) => s + t.measuredMs, 0), byType, findings };
  }).sort((a, b) => a.personName.localeCompare(b.personName, 'es'));

  return { people, types };
};
