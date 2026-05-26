const TRIAGE_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

const TRIAGE_SCHEMA = {
  type: 'object',
  properties: {
    category: {
      type: 'string',
      enum: ['BASECAMP', 'CLIENT_COMMUNICATION', 'TEAM_OPERATIONS', 'ADMIN_ALERTS', 'SUPPORT', 'NOISE']
    },
    priority: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
    intent: { type: 'string' }, // Ej. 'Cambio solicitado por cliente', 'Asignación de tarea', 'Informativo'
    summary: { type: 'string' },
    actionItems: { type: 'array', items: { type: 'string' } },
    actionLink: { type: 'string' },
    shouldDisplay: { type: 'boolean' }
  },
  required: ['category', 'priority', 'intent', 'summary', 'actionItems', 'shouldDisplay']
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
  const prompt = `Actúa como un Analista de Operaciones Senior de Brainstudio.
  Tu misión es realizar un triaje profundo y filtrado de ruido para la bandeja de entrada ejecutiva.

  FILTRADO DE RUIDO (shouldDisplay: false):
  - Notificaciones automáticas de Figma (a menos que sean menciones directas críticas).
  - Confirmaciones de calendario ('Reunión aceptada', 'Invitation updated').
  - Correos de bots, alertas de sistema o newsletters.
  - Alertas administrativas rutinarias (DIAN, bancos) a menos que requieran acción inmediata (HIGH priority).

  PRIORIDAD DE VISIBILIDAD (shouldDisplay: true):
  - Conversaciones HUMANAS directas con clientes o el equipo.
  - Notificaciones de Basecamp sobre tareas, comentarios o pings.
  - Alertas críticas de plataforma que requieren intervención humana.

  EXTRACCIÓN DE DATOS:
  1. intent: Clasifica la intención (ej. 'Cambio solicitado por cliente', 'Asignación de tarea', 'Aprobación recibida').
  2. actionItems: Lista los sub-pasos o requisitos clave mencionados.
  3. actionLink: Busca un link de acción directa (Basecamp, Google Sheets, Figma) mencionado en el snippet.

  EMAIL:
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
    console.error(`[EmailTriage] Deep Extraction Error for email ${email.id}:`, error.message);

    // SMART FALLBACK
    const content = `${email.from} ${email.subject} ${email.snippet}`.toLowerCase();
    const isBasecamp = content.includes('basecamp') || content.includes('3.basecamp.com');
    const isBot = content.includes('noreply') || content.includes('no-reply') || content.includes('calendar-notification');

    // Attempt link extraction via regex for fallback
    const linkMatch = email.snippet?.match(/https?:\/\/[^\s]+/);

    return {
      ...email,
      triage: {
        category: isBasecamp ? 'BASECAMP' : 'CLIENT_COMMUNICATION',
        priority: 'MEDIUM',
        intent: isBasecamp ? 'Notificación de Basecamp' : 'Comunicación externa',
        summary: '(Fallback) ' + (email.subject || 'Sin asunto'),
        actionItems: ['Revisar correo original para detalles'],
        actionLink: linkMatch ? linkMatch[0] : null,
        shouldDisplay: !isBot // Filter bots even in fallback
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
    console.error('[EmailTriage] Deep Batch processing failed:', err.message);
    return emails.filter(e => {
        const c = `${e.from} ${e.subject}`.toLowerCase();
        return !c.includes('noreply') && !c.includes('calendar');
    }).map(e => ({
      ...e,
      triage: {
        category: 'CLIENT_COMMUNICATION',
        priority: 'MEDIUM',
        intent: 'Informativo',
        summary: e.subject,
        actionItems: [],
        shouldDisplay: true
      }
    }));
  }
};

export const onlyBasecampEmails = (emails) => emails.filter((email) => email.triage?.category === 'BASECAMP');
