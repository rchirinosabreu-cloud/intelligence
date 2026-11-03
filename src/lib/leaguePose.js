export const LEAGUE_POSES = ['rest', 'wave', 'celebrate'];

// Un sorteo entre las otras poses garantiza un cambio en cada apertura.
export function nextLeaguePose(previous, random = Math.random) {
  return (previous + 1 + Math.floor(random() * (LEAGUE_POSES.length - 1))) % LEAGUE_POSES.length;
}
