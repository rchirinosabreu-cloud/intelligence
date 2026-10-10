// El aviso de «muchas horas en una tarea»: un solo número para el servidor y la pantalla. Rodny, 9 de octubre de
// 2026: «ya eso existe cuando pasa de 15 horas … mejor reduzcamos ese anuncio para las 10 horas». Un reloj que se
// queda corriendo se nota antes y Ritmo deja de contarlo como trabajo a partir de las 8 h de una sola sesión.
export const EXCESSIVE_TASK_THRESHOLD_HOURS = 10;
export const EXCESSIVE_TASK_THRESHOLD_MS = EXCESSIVE_TASK_THRESHOLD_HOURS * 60 * 60 * 1000;
