// La liga de noviembre en la muestra local (2 y 3 de noviembre de 2026): las trece personas de la carrera con su avatar
// en píxel (los diseños de OpenAI, recortados de su lámina para la muestra) y puntajes ficticios. Nunca decide nada
// en producción. Los nombres son los del equipo real porque la muestra es para que Rodny vea cómo se verá; los
// puntajes y los regalos son inventados.
import { DAILY_HABITS, leagueNextStep, leagueScore, summarizeDays, todayPoints, trackScale } from '../../src/lib/platformLeague.js';


export const LEAGUE_ROSTER = [
  ['jesu', 'Jesu', 'M'], ['keila', 'Keila', 'F'], ['sara', 'Sara', 'F'], ['kamila', 'Kamila', 'F'], ['brayan', 'Brayan', 'M'],
  ['rodny', 'Rodny', 'M'], ['francisco', 'Francisco', 'M'], ['melissa', 'Melissa', 'F'], ['elisa', 'Elisa', 'F'],
  ['helen', 'Helen', 'F'], ['francys', 'Francys', 'F'], ['david', 'David', 'M'], ['mariceth', 'Mariceth', 'F']
].map(([id, name, gender]) => ({ id, name, gender, pixelAvatarKey: id, avatarUrl: null }));

/** Puntos ficticios de los demás al tercer día hábil del mes (hasta 75 por hábitos y extras, más regalos). */
const SCORES = { jesu: 35, keila: 65, sara: 50, kamila: 70, brayan: 45, rodny: 60, francisco: 55, melissa: 95, elisa: 40, helen: 80, francys: 50, david: 20, mariceth: 60 };

const habitsOf = (values) => Object.fromEntries(DAILY_HABITS.map((habit, index) => [habit.key, values[index]]));

/** Los días jugados por quien mira (Rodny): dos días hábiles cerrados (uno con los cinco hábitos y el extra de abrir primero). */
const myDays = ({ perfect = false } = {}) => {
  const closed = perfect
    ? [[true, true, true, true, true], [true, true, true, true, true]]
    : [[true, true, true, true, true], [true, false, true, false, true]];
  return closed.map((values, index) => ({ day: `2026-11-0${index + 2}`, habits: habitsOf(values), extras: { PRIMERO_EN_ABRIR: index === 0 || perfect, PRIMERO_EN_REUNION: null } }));
};

export function leagueDemoPayload({ winner = false, perfect = false, viewerId = 'rodny' } = {}) {
  const days = myDays({ perfect });
  const today = { day: '2026-11-04', habits: habitsOf(perfect ? [true, true, true, true, true] : [true, true, false, null, true]), extras: { PRIMERO_EN_ABRIR: perfect ? true : false, PRIMERO_EN_REUNION: null } };
  const kudos = {
    received: perfect
      ? [{ from: 'Helen', note: 'Siempre responde primero.', week: '2026-W45' }, { from: 'Melissa', note: 'Me salvó con el reel.', week: '2026-W45' }]
      : [{ from: 'Helen', note: 'Me salvó con el reel de Nutresa.', week: '2026-W45' }],
    givenThisWeek: null,
    weeklyBudget: 10
  };
  const allDays = [...days, today];
  const score = leagueScore({ days: allDays, kudos: kudos.received });
  const lanes = LEAGUE_ROSTER.map((person) => {
    const laneScore = person.id === viewerId ? score : SCORES[person.id];
    return { ...person, score: laneScore, isSelf: person.id === viewerId };
  });
  const ranked = [...lanes].sort((a, b) => b.score - a.score);
  const melissa = LEAGUE_ROSTER.find((person) => person.id === 'melissa');
  return {
    month: '2026-11',
    closesOn: 'lunes 30',
    daysLeft: 26,
    score,
    gender: 'M',
    today: { ...today, ...todayPoints(today) },
    nextStep: leagueNextStep(allDays),
    streak: { days: summarizeDays(allDays).fullDays, label: 'con los 5 hábitos' },
    kudos: { ...kudos, score: kudos.received.length * 10 },
    position: { rank: ranked.findIndex((lane) => lane.isSelf) + 1, of: lanes.length },
    nextStepUrl: '/gestion',
    podium: ranked.slice(0, 3).map((lane) => ({ id: lane.id, name: lane.name, pixelAvatarKey: lane.pixelAvatarKey, avatarUrl: null, score: lane.score })),
    winner: winner ? { ...melissa, score: 610, month: '2026-10', note: 'El bono se entrega esta semana.' } : null,
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
