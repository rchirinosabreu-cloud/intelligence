import confetti from 'canvas-confetti';

// Rodny, 30 de septiembre de 2026: «a nadie le sale el confeti cuando se termina una tarea».
// Sí salía. Eran 50 partículas diminutas, **un tercio de ellas blancas sobre un tablero claro**,
// disparadas desde el centro de abajo de la ventana —lejos de la columna «Realizado»— y repartidas
// por 1500 px de pantalla. Técnicamente se disparaba; nadie lo registraba.
//
// Dos cambios: sale **desde donde ocurrió la acción**, y los colores salen de los tokens de marca
// de `index.css` (los hexadecimales de abajo son solo el respaldo). El blanco se quitó: sobre una
// superficie clara no existe.
//
// «El confeti debe ser con los colores de brain, el verdesito y con moradito puede ser» (Rodny, el
// mismo día). Con los cinco colores de la paleta la ráfaga salía anaranjada —el coral y el amarillo
// se comen a los demás—, así que se queda con el verde, el cian que los une en
// `brain-gradient-primary` y el magenta, que es el «moradito» de la marca: en la paleta oficial no
// hay morados, están en desuso.
const BRAND_TOKENS = ['--brand-green', '--brand-cyan', '--brand-magenta'];
// Respaldo para cuando no hay ventana (pruebas) o los tokens aún no se han aplicado.
const FALLBACK_COLORS = ['#31AA8A', '#009BBF', '#A8118C'];
const DEFAULT_ORIGIN = { x: 0.5, y: 0.8 };

// Los tokens son tripletas RGB (`0 155 191`) y **canvas-confetti solo entiende hexadecimales**:
// a cualquier otra cosa le arranca los caracteres que no son hex y lee los seis primeros, así que
// `rgb(49 170 138)` se convertía en `b49170…`, un marrón anaranjado. Por eso se pasa a hex aquí.
const tripletToHex = (triplet) => {
    const parts = String(triplet).trim().split(/[\s,/]+/).slice(0, 3).map(Number);
    if (parts.length < 3 || parts.some(value => !Number.isFinite(value))) return null;
    return `#${parts.map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('')}`;
};

const brandColors = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return FALLBACK_COLORS;
    const root = getComputedStyle(document.documentElement);
    const colors = BRAND_TOKENS
        .map(token => tripletToHex(root.getPropertyValue(token)))
        .filter(Boolean);
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
