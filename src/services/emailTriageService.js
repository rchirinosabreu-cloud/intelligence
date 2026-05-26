const TRIAGE_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

const TRIAGE_SCHEMA = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: ['BASECAMP', 'CLIENT_COMMUNICATION', 'INTERNAL_OPERATIONS', 'NOISE'] },
    priority: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
    summary: { type: 'string' },
    shouldDisplay: { type: 'boolean' }
  },
  required: ['category', 'priority', 'summary', 'shouldDisplay']
};

export const normalizeModelJson = (rawText) => {
  if (!rawText) throw new Error('Empty AI response');
  const cleaned = String(rawText).replace(/```json|```/gi, '').trim();
  const matched = cleaned.match(/\{[\s\S]*\}/);
  const jsonText = matched ? matched[0] : cleaned;
  return JSON.parse(jsonText);
};

const getResponseText = (result) => {
  const directText = typeof result?.response?.text === 'function'
    ? result.response.text()
    : result?.response?.text;

  if (directText && String(directText).trim()) return directText;

  const firstPart = result?.candidates?.[0]?.content?.parts?.[0];
  if (firstPart?.text && String(firstPart.text).trim()) return firstPart.text;
  if (firstPart?.functionCall?.args) return JSON.stringify(firstPart.functionCall.args);

  return '';
};

const classifyEmail = async (email, genAI) => {
  const prompt = `Clasifica este correo ejecutivo y responde SOLO JSON válido con el esquema solicitado.\nFrom: ${email.from || ''}\nSubject: ${email.subject || ''}\nSnippet: ${email.snippet || ''}`;

  const result = await genAI.models.generateContent({
    model: TRIAGE_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: TRIAGE_SCHEMA
    }
  });

  const text = getResponseText(result);

  try {
    const triage = normalizeModelJson(text);
    return { ...email, triage };
  } catch (error) {
    console.warn('[EmailTriage] Falling back to NOISE due to parse issue:', error.message);
    return {
      ...email,
      triage: {
        category: 'NOISE',
        priority: 'LOW',
        summary: 'No se pudo clasificar con confianza.',
        shouldDisplay: false
      }
    };
  }
};

export const triageEmailsWithAI = async (emails, genAI) => {
  if (!Array.isArray(emails) || emails.length === 0) return [];
  const triaged = await Promise.all(emails.map((email) => classifyEmail(email, genAI)));
  return triaged.filter((email) => email.triage?.shouldDisplay === true);
};

export const onlyBasecampEmails = (emails) => emails.filter((email) => email.triage?.category === 'BASECAMP');
