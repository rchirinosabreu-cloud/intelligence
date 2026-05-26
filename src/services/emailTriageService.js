const TRIAGE_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

const TRIAGE_SCHEMA = {
  type: 'object',
  properties: {
    category: {
      type: 'string',
      enum: ['BASECAMP', 'CLIENT_NOTIFICATIONS', 'TEAM_TASKS', 'ADMIN_ALERTS', 'SUPPORT', 'NOISE']
    },
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
  const prompt = `Actúa como un Analista de Operaciones de Brainstudio. Clasifica este correo y responde SOLO JSON con este esquema exacto.

  REGLAS DE CATEGORIZACIÓN:
  - BASECAMP: Solo si proviene de 'Basecamp' (notificaciones de tareas, comentarios, pings).
  - CLIENT_NOTIFICATIONS: Comunicaciones directas de clientes.
  - TEAM_TASKS: Mensajes internos de coordinación o herramientas de diseño (Figma, etc).
  - ADMIN_ALERTS: Facturas, pagos, alertas legales o de plataforma.
  - SUPPORT: Soporte técnico o tickets.
  - NOISE: Newsletters, promociones o spam irrelevante.

  PRIORIDAD (priority):
  - HIGH: Bloqueos críticos, quejas de clientes, tareas para hoy.
  - MEDIUM: Tareas estándar, notificaciones de progreso.
  - LOW: Informativos, acuses de recibo.

  shouldDisplay: true para todas las categorías excepto NOISE.

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
    console.error(`[EmailTriage] Error classifying email ${email.id}:`, error.message);

    // SMART FALLBACK: Simple keyword matching to avoid noise in Basecamp widget
    const content = `${email.from} ${email.subject} ${email.snippet}`.toLowerCase();
    const isBasecamp = content.includes('basecamp') || content.includes('3.basecamp.com');

    return {
      ...email,
      triage: {
        category: isBasecamp ? 'BASECAMP' : 'CLIENT_NOTIFICATIONS',
        priority: 'MEDIUM',
        summary: '(Fallback) ' + (email.subject || 'Sin asunto'),
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
    // Even if batch fails, return a safe subset using basic filtering
    return emails.map(e => {
        const content = `${e.from} ${e.subject}`.toLowerCase();
        return {
            ...e,
            triage: {
                category: content.includes('basecamp') ? 'BASECAMP' : 'NOISE',
                priority: 'LOW',
                summary: e.subject,
                shouldDisplay: content.includes('basecamp')
            }
        };
    }).filter(e => e.triage.shouldDisplay);
  }
};

export const onlyBasecampEmails = (emails) => emails.filter((email) => email.triage?.category === 'BASECAMP');
