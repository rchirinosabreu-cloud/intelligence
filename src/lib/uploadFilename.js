// El nombre de un archivo subido (Rodny, 14 de octubre de 2026: «los archivos cuyo nombre
// tienen acentos o carácteres especiales no se están reconociendo»).
//
// El navegador manda el nombre en UTF-8, pero el estándar de los formularios con archivos
// no declara la codificación, así que la librería que los lee los interpreta byte a byte
// (latin1). La «ó» viaja como dos bytes, 0xC3 0xB3, y leídos de uno en uno se convierten
// en «Ã» y «³»: «Gestión» llega como «GestiÃ³n» y así se guardaba en la base.
//
// Esto lo deshace, con una condición: **solo** cuando el resultado es exactamente los
// mismos bytes leídos como UTF-8. Un nombre que ya está bien no se toca, que es lo que de
// verdad importa: romper «Gestión» por intentar arreglarlo sería peor que el defecto.

/**
 * Devuelve el nombre tal como lo escribió la persona. Si no hay señales claras de que se
 * leyó mal, devuelve el original sin tocarlo.
 */
export const decodeUploadedFilename = (value) => {
    const name = String(value ?? '');
    // Sin bytes altos no hay nada que deshacer.
    if (!name || !/[\u0080-ÿ]/.test(name)) return name;
    // Si tiene algo que no cabe en un byte, no vino de una lectura latin1.
    if (/[^\u0000-ÿ]/.test(name)) return name;

    const bytes = Buffer.from(name, 'latin1');
    const decoded = bytes.toString('utf8');
    // El carácter de reemplazo significa que esos bytes no eran UTF-8: era un nombre
    // latin1 de verdad («Gestión» escrito con un solo byte), y se deja como está.
    if (decoded.includes('�')) return name;
    // Y solo se acepta si la vuelta es exacta; si no, no sabemos qué era.
    return Buffer.from(decoded, 'utf8').equals(bytes) ? decoded : name;
};
