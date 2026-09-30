import confetti from 'canvas-confetti';

// Rodny, 30 de septiembre de 2026: «a nadie le sale el confeti cuando se termina una tarea».
// Sí salía. Eran 50 partículas diminutas, **un tercio de ellas blancas sobre un tablero claro**,
// disparadas desde el centro de abajo de la ventana —lejos de la columna «Realizado»— y repartidas
// por 1500 px de pantalla. Técnicamente se disparaba; nadie lo registraba.
//
// Dos cambios: sale **desde donde ocurrió la acción** (la propia tarjeta), y los colores son los
// de la marca leídos de los tokens de `index.css`, nunca hexadecimales escritos aquí. El blanco
// se quitó: sobre una superficie clara no existe.

const BRAND_TOKENS = ['--brand-cyan', '--brand-green', '--brand-magenta', '--brand-coral', '--brand-yellow'];
// Respaldo para cuando no hay ventana (pruebas) o los tokens aún no se han aplicado.
const FALLBACK_COLORS = ['#009BBF', '#31AA8A', '#A8118C', '#FF6A68', '#FCD200'];
const DEFAULT_ORIGIN = { x: 0.5, y: 0.8 };

const brandColors = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return FALLBACK_COLORS;
    const root = getComputedStyle(document.documentElement);
    // Los tokens son tripletas RGB (`0 155 191`), no colores completos: hay que envolverlas.
    const colors = BRAND_TOKENS
        .map(token => root.getPropertyValue(token).trim())
        .filter(Boolean)
        .map(triplet => `rgb(${triplet.replace(/\s+/g, ' ')})`);
    return colors.length === BRAND_TOKENS.length ? colors : FALLBACK_COLORS;
};

// canvas-confetti quiere el origen en coordenadas 0..1 de la ventana. Un elemento fuera de
// pantalla o sin medida cae al centro de abajo de siempre.
export const originOfElement = (element) => {
    if (typeof window === 'undefined' || !element || typeof element.getBoundingClientRect !== 'function') return DEFAULT_ORIGIN;
    const box = element.getBoundingClientRect();
    if (!box.width && !box.height) return DEFAULT_ORIGIN;
    const clamp = (value) => Math.min(Math.max(value, 0.05), 0.95);
    return {
        x: clamp((box.left + box.width / 2) / window.innerWidth),
        y: clamp((box.top + box.height / 3) / window.innerHeight)
    };
};

/**
 * Celebra una tarea terminada. `element` es la tarjeta o el control que la cerró: el disparo sale
 * de ahí, para que se lea como consecuencia de la acción y no como un adorno suelto en la pantalla.
 */
export const triggerConfetti = (element) => {
    const shared = {
        colors: brandColors(),
        origin: originOfElement(element),
        zIndex: 9999, // Por encima de cualquier modal (los de la plataforma van de 70 a 210).
        disableForReducedMotion: true
    };
    // Dos ráfagas: una que sube y otra más lenta y abierta justo detrás. Es lo que hace que se lea
    // como celebración; una sola de 50 partículas se leía como dos motas cruzando la pantalla.
    confetti({ ...shared, particleCount: 90, spread: 78, startVelocity: 42, ticks: 170, scalar: 1.05 });
    confetti({ ...shared, particleCount: 45, spread: 130, startVelocity: 24, ticks: 150, scalar: 0.8 });
};
