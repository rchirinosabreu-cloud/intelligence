export const parseGeminiCards = (responseText) => {
  if (!responseText) {
    throw new Error('La respuesta de Gemini está vacía.');
  }

  const cleaned = responseText
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  const parsed = JSON.parse(cleaned);

  if (!parsed || !Array.isArray(parsed.cards)) {
    throw new Error('Gemini no devolvió un JSON con el arreglo "cards".');
  }

  return parsed.cards;
};
