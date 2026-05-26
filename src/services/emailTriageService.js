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
  try {
    const cleaned = String(rawText).replace(/```json|```/gi, '').trim();
    const matched = cleaned.match(/\{[\s\S]*\}/);
    const jsonText = matched ? matched[0] : cleaned;
    return JSON.parse(jsonText);
  } catch (err) {
    console.error('[TriageService] JSON Parse Error. Raw text:', rawText);
    throw err;
  }
};

const classifyEmail = async (email, genAI) => {
  const prompt = `Clasifica este correo ejecutivo y responde SOLO JSON válido con el esquema solicitado.

  REGLAS:
  1. Identifica si es de Basecamp (Notificaciones).
  2. Resume lo más importante.
  3. Si no estás seguro, pon shouldDisplay: true.

  From: ${email.from || ''}
  Subject: ${email.subject || ''}
  Snippet: ${email.snippet || ''}`;

  try {
    const model = genAI.getGenerativeModel({ model: TRIAGE_MODEL });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: TRIAGE_SCHEMA
      }
    });

    const text = typeof result?.response?.text === 'function' ? result.response.text() : result?.response?.text;
    const triage = normalizeModelJson(text);
    return { ...email, triage };
  } catch (error) {
    console.error(`[EmailTriage] Critical Error classifying email ${email.id}:`, error.message);

    // FALLBACK: Don't let the email disappear. Show it as BASECAMP so it's visible in widgets.
    return {
      ...email,
      triage: {
        category: 'BASECAMP',
        priority: 'MEDIUM',
        summary: 'Error en triaje IA: ' + error.message,
        shouldDisplay: true
      }
    };
  }
};

export const triageEmailsWithAI = async (emails, genAI) => {
  if (!Array.isArray(emails) || emails.length === 0) return [];

  try {
    const triaged = await Promise.all(emails.map((email) => classifyEmail(email, genAI)));
    return triaged.filter((email) => email.triage?.shouldDisplay === true);
  } catch (err) {
    console.error('[EmailTriage] Batch processing failed:', err.message);
    return emails.map(e => ({
      ...e,
      triage: { category: 'BASECAMP', priority: 'LOW', summary: 'Error de procesamiento masivo', shouldDisplay: true }
    }));
  }
};

export const onlyBasecampEmails = (emails) => emails.filter((email) => email.triage?.category === 'BASECAMP');
