export const LEAGUE_POSES = ['rest', 'wave', 'celebrate'];

// Un sorteo entre las otras poses garantiza un cambio en cada apertura.
export function nextLeaguePose(previous, random = Math.random) {
  return (previous + 1 + Math.floor(random() * (LEAGUE_POSES.length - 1))) % LEAGUE_POSES.length;
}

// Avatares animados (Rodny, 21 de noviembre de 2026: «trabajemos con las opciones 2D animadas, me gustan»).
// Cada persona tiene una hoja de ocho cuadros en `assets/team-pixel/anim`: 0 reposo, 1 a 3 saludo, 4 a 7 celebración.
export const LEAGUE_SPRITE_FRAMES = 8;
/** Del cuadro de 88 píxeles, lo que ocupa el cuerpo: las manos en alto se asoman fuera sin empujar a nadie. */
const SPRITE_BODY_WIDTH = 62;
const STILL_FRAMES = { rest: 0, wave: 3, celebrate: 7 };

/** El gesto que hace una pose. Al pasar el cursor o tocar (`asked`), quien está en reposo saluda. */
export function leagueGesture(pose, asked = false) {
  if (pose === 'celebrate') return 'celebrate';
  return pose === 'wave' || asked ? 'wave' : null;
}

/** El cuadro fijo de cada pose, para quien pide movimiento reducido. */
export const leagueStillFrame = (pose) => STILL_FRAMES[pose] ?? 0;

/** Medidas para mostrar un cuadro de la hoja con la persona a `size` píxeles de alto visible. */
export function spriteLayout({ sheet, person, size }) {
  if (!sheet || !person || !(person.height > 0) || !(size > 0)) return null;
  const scale = size / person.height;
  return {
    scale,
    height: size,
    width: SPRITE_BODY_WIDTH * scale,
    frameWidth: sheet.frameWidth * scale,
    frameHeight: sheet.frameHeight * scale,
    sheetWidth: sheet.frameWidth * sheet.frames * scale,
    top: -person.top * scale,
  };
}
