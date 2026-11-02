// Las cifras de una respuesta tienen que salir de lo que devolvieron las herramientas en este turno, de la
// pregunta o de la conversación (31 de octubre de 2026). Antes un planificador adivinaba por adelantado qué
// cálculos iba a necesitar la respuesta y, si no llegaba un recibo para cada uno, el turno terminaba en un
// texto fijo; eso salió para una pregunta de memoria que no pedía ninguna cifra. Ahora se mira al final: lo
// que Bria escribió, contra lo que de verdad leyó. Una cifra que no sale de ninguna parte se le devuelve una
// vez para que la consulte (consultar_plataforma suma subconjuntos con idsParaSumar) o no la dé.

const DIGITS = /\d[\d.,\s]*\d|\d/g;
const MIN_LENGTH = 4;

/** Formas en que un mismo número puede escribirse: «1.200.000», «1200000», «1200000.00», «200,75». */
const variants = (token) => {
  const plain = token.replace(/[\s.,]/g, '');
  if (!plain) return [];
  const forms = new Set([plain]);
  // «301» en los datos se puede escribir «301,00»; «301.00» en los datos se puede escribir «301».
  if (/\.\d{1,2}$|,\d{1,2}$/.test(token)) forms.add(plain.replace(/0+$/, ''));
  forms.add(`${plain}00`);
  forms.add(`${plain}0`);
  return [...forms];
};

const isYear = (token) => /^(19|20)\d{2}$/.test(token.replace(/[\s.,]/g, ''));

const tokens = (text) => (String(text || '').match(DIGITS) || []).map((token) => token.trim());

/** Números del texto que no aparecen en ninguna evidencia. Solo cifras de cuatro dígitos o más; los años no cuentan. */
export const unsupportedFigures = (answer, evidence = []) => {
  const known = new Set();
  for (const source of evidence) for (const token of tokens(source)) for (const form of variants(token)) known.add(form);
  const missing = [];
  for (const token of tokens(answer)) {
    const plain = token.replace(/[\s.,]/g, '');
    if (plain.length < MIN_LENGTH || isYear(token) || missing.includes(token)) continue;
    if (!variants(token).some((form) => known.has(form))) missing.push(token);
  }
  return missing;
};
