// La liga de noviembre en la muestra local (2 y 3 de noviembre de 2026): las trece personas de la carrera con su avatar
// en píxel (los diseños de OpenAI, recortados de su lámina para la muestra) y puntajes ficticios. Nunca decide nada
// en producción. Los nombres son los del equipo real porque la muestra es para que Rodny vea cómo se verá; los
// puntajes y los regalos son inventados.
import { DAILY_HABITS, constancyStandings, leagueNextStep, leagueScore, kudosScore, leagueRank, leagueWeekLabel, summarizeDays, todayPoints, trackScale } from '../../src/lib/platformLeague.js';

/** La constancia ficticia (12 de noviembre de 2026): ganados, jugados y días jugados de siete días cerrados. Elisa tiene
 * un 100 % de dos días y David pocos días: no entran. Melissa y Mariceth empatan en el segundo puesto. */
const CONSTANCY = { helen: [38, 40, 7], melissa: [34, 37, 6], mariceth: [24, 26, 5], keila: [30, 34, 7], rodny: [30, 35, 7], kamila: [29, 34, 6],
  brayan: [24, 30, 6], jesu: [28, 36, 7], francisco: [24, 32, 6], francys: [26, 36, 7], sara: [21, 30, 5], david: [9, 15, 3], elisa: [8, 8, 2] };


export const LEAGUE_ROSTER = [
  ['jesu', 'Jesu', 'M'], ['keila', 'Keila', 'F'], ['sara', 'Sara', 'F'], ['kamila', 'Kamila', 'F'], ['brayan', 'Brayan', 'M'],
  ['rodny', 'Rodny', 'M'], ['francisco', 'Francisco', 'M'], ['melissa', 'Melissa', 'F'], ['elisa', 'Elisa', 'F'],
  ['helen', 'Helen', 'F'], ['francys', 'Francys', 'F'], ['david', 'David', 'M'], ['mariceth', 'Mariceth', 'F']
].map(([id, name, gender]) => ({ id, name, gender, pixelAvatarKey: id, avatarUrl: null }));

/** Puntos ficticios de los demás al tercer día hábil del mes (hasta 75 por hábitos y extras, más regalos). */
const SCORES = { jesu: 35, keila: 65, sara: 50, kamila: 70, brayan: 45, rodny: 60, francisco: 55, melissa: 95, elisa: 40, helen: 80, francys: 50, david: 20, mariceth: 60 };

const habitsOf = (values) => Object.fromEntries(DAILY_HABITS.map((habit, index) => [habit.key, values[index]]));

/** Los días jugados por quien mira (Rodny): dos días hábiles cerrados (uno con los seis hábitos y el extra de abrir primero). */
const myDays = ({ perfect = false } = {}) => {
  const closed = perfect
    ? [[true, true, true, true, true, true], [true, true, true, true, true, true]]
    : [[true, true, true, true, true, true], [true, false, true, false, true, true]];
  return closed.map((values, index) => ({ day: `2026-11-0${index + 2}`, habits: habitsOf(values), extras: { PRIMERO_EN_ABRIR: index === 0 || perfect, PRIMERO_EN_REUNION: null } }));
};

/** La semana de la muestra (miércoles 4 de noviembre, semana del 2 al 8) y la anterior, que ganó Melissa. */
const WEEK_SCORES = { jesu: 20, keila: 35, sara: 30, kamila: 40, brayan: 30, rodny: 0, francisco: 25, melissa: 45, elisa: 25, helen: 40, francys: 20, david: 10, mariceth: 30 };

export function leagueDemoPayload({ winner = false, perfect = false, viewerId = 'rodny' } = {}) {
  const days = myDays({ perfect });
  const today = { day: '2026-11-04', habits: habitsOf(perfect ? [true, true, true, true, true, true] : [true, true, false, null, true, true]), extras: { PRIMERO_EN_ABRIR: perfect ? true : false, PRIMERO_EN_REUNION: null } };
  const kudos = {
    received: perfect
      ? [{ from: 'Helen', note: 'Siempre responde primero.', week: '2026-W45' }, { from: 'Melissa', note: 'Me salvó con el reel.', week: '2026-W45' }]
      : [{ from: 'Helen', note: 'Me salvó con el reel de Nutresa.', week: '2026-W45' }],
    givenThisWeek: null,
    weeklyBudget: 5, weekKey: '2026-W45'
  };
  const allDays = [...days, today];
  const score = leagueScore({ days: allDays, kudos: kudos.received, recognitions: leagueDemoRecognitions.total });
  const lanes = LEAGUE_ROSTER.map((person) => {
    const laneScore = person.id === viewerId ? score : SCORES[person.id];
    const provisional = person.id === viewerId ? todayPoints(today).points : Math.min(10, laneScore);
    return { ...person, score: laneScore, scoreBreakdown: { confirmed: laneScore - provisional, provisional }, isSelf: person.id === viewerId };
  });
  const ranked = [...lanes].sort((a, b) => b.score - a.score);
  const melissa = LEAGUE_ROSTER.find((person) => person.id === 'melissa');
  // La semana arranca en cero cada lunes (Rodny, 9 de noviembre de 2026): quien mira lleva lo de esta semana (los tres días caen en ella).
  const weekLanes = LEAGUE_ROSTER.map((person) => ({ id: person.id, name: person.name, fullName: person.name, avatarUrl: null, pixelAvatarKey: person.pixelAvatarKey, isSelf: person.id === viewerId,
    score: person.id === viewerId ? score : WEEK_SCORES[person.id] }));
  const weekRanked = [...weekLanes].filter(lane => lane.score > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'es'));
  const weekSelf = weekLanes.find(lane => lane.isSelf);
  return {
    month: '2026-11',
    week: {
      key: '2026-W45', from: '2026-11-02', to: '2026-11-08', label: leagueWeekLabel('2026-11-02', '2026-11-08'),
      score: weekSelf.score,
      position: weekSelf.score > 0 ? { rank: leagueRank(weekSelf.score, weekRanked), of: weekRanked.length } : null,
      lanes: weekLanes,
      podium: weekRanked.slice(0, 3).map((lane, index) => ({ id: lane.id, name: lane.name, pixelAvatarKey: lane.pixelAvatarKey, avatarUrl: null, score: lane.score, rank: index + 1 })),
      lastWeek: { key: '2026-W44', from: '2026-10-26', to: '2026-11-01', label: leagueWeekLabel('2026-10-26', '2026-11-01'), leaders: [{ id: 'melissa', name: 'Melissa', pixelAvatarKey: 'melissa', avatarUrl: null, score: 60 }] }
    },
    closesOn: 'lunes 30',
    daysLeft: 26,
    score,
    scoreBreakdown: lanes.find(lane => lane.isSelf).scoreBreakdown,
    gender: 'M',
    // Hábitos por área (12 de noviembre de 2026): la evidencia nombra cada fuente que se jugó.
    today: { ...today, ...todayPoints(today), isProvisional: true, isConfirmed: false, points: todayPoints(today).points + 10, evidence: perfect ? {} : {
      AL_DIA: 'Tareas: Amaneció sin vencidas. · Parrillas: Sin piezas atrasadas en sus 3 cuentas. · CRM: Sin seguimientos vencidos.',
      A_TIEMPO: 'Tareas: 1 de 1 a tiempo. · Parrillas: 1 de 2 piezas de hoy publicadas o programadas.',
      DOCUMENTADO: 'Sin tareas creadas ese día.'
    } },
    recognitionPoints: 20,
    meetings: { canManage: true, minDate: "2026-11-03", maxDate: "2026-11-04", entries: [] },
    nextStep: leagueNextStep(allDays),
    streak: { days: summarizeDays(allDays).fullDays, label: 'con todos los hábitos' },
    kudos: { ...kudos, score: kudosScore(kudos.received) },
    position: { rank: leagueRank(score, ranked), of: lanes.length },
    nextStepUrl: '/gestion',
    podium: ranked.slice(0, 3).map((lane) => ({ id: lane.id, name: lane.name, pixelAvatarKey: lane.pixelAvatarKey, avatarUrl: null, score: lane.score })),
    winner: winner ? { ...melissa, score: 610, month: '2026-10', note: 'El bono se entrega este mes.' } : null,
    constancy: constancyStandings(LEAGUE_ROSTER.map(({ id, name, pixelAvatarKey }) => {
      const [won, played, daysPlayed] = CONSTANCY[id];
      return { id, name, pixelAvatarKey, avatarUrl: null, isSelf: id === viewerId, won, played, daysPlayed, percent: Math.round((won * 100) / played) };
    }), { closedDays: 7 }),
    race: { lanes, track: trackScale(lanes.map((lane) => lane.score)) }
  };
}

export const leagueDemoRecognitions = {
  month: '2026-11', total: 4,
  counts: { FIRST_TASK: 2, EARLY_DELIVERY: 1, DAILY_EIGHT: 1 },
  recent: [
    { id: 'award-4', kind: 'DAILY_EIGHT', occurredAt: '2026-11-04T20:10:00Z' },
    { id: 'award-3', kind: 'EARLY_DELIVERY', occurredAt: '2026-11-04T15:30:00Z' },
    { id: 'award-2', kind: 'FIRST_TASK', occurredAt: '2026-11-03T13:20:00Z' },
    { id: 'award-1', kind: 'FIRST_TASK', occurredAt: '2026-11-02T13:15:00Z' },
  ], hasMore: false,
};
