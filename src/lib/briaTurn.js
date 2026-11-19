// Bria se pone de frente cuando el cursor está sobre ella (Rodny, 18 de noviembre de 2026: «no puede ponerse de
// frente cuando pongo el cursor sobre ella? como es un blender supongo que ya podemos jugar con ello mejor»).
// El ciclo de reposo está renderizado desde Blender en varios ángulos (de tres cuartos a de frente), en una sola
// imagen: una fila por ángulo y una columna por cuadro del ciclo. El reproductor elige la columna por el tiempo y la
// fila por el ángulo, así el giro arranca desde donde va el ciclo y vuelve desde donde esté: nunca salta un cuadro.
// Gira el cuerpo entero; la cabeza nunca gira sola (cara y cuerpo son una pieza).
export const BRIA_TURN = Object.freeze({ cols: 60, rows: 6, cell: 160, fps: 15, turnMs: 110 });

/** La columna del ciclo para un instante: 60 cuadros a 15 por segundo, cuatro segundos que se repiten sin corte. */
export function turnColumn(elapsedMs, { cols, fps } = BRIA_TURN) {
  return Math.floor(Math.max(0, elapsedMs) * fps / 1000) % cols;
}

/** El ángulo se acerca a su destino con suavidad (0 = tres cuartos, 1 = de frente) y llega sin quedarse corto. */
export function stepTurn(current, target, dtMs, { turnMs } = BRIA_TURN) {
  const next = current + (target - current) * (1 - Math.exp(-Math.max(0, dtMs) / turnMs));
  return Math.abs(target - next) < 0.02 ? target : next;
}

/** La fila del ángulo en la imagen. */
export function turnRow(amount, { rows } = BRIA_TURN) {
  return Math.min(rows - 1, Math.max(0, Math.round(amount * (rows - 1))));
}
