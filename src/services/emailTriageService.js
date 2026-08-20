const TRIAGE_MODEL = process.env.OPENAI_MODEL_EMAIL || process.env.OPENAI_MODEL || 'gpt-5-mini';

const TRIAGE_SCHEMA = {
  type: 'object',
  properties: {
    category: {
      type: 'string',
      enum: ['BASECAMP', 'CLIENT_COMMUNICATION', 'TEAM_OPERATIONS', 'ADMIN_ALERTS', 'SUPPORT', 'NOISE']
    },
    priority: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
    intent: { type: 'string' },
    summary: { type: 'string' },
    actionItems: { type: 'array', items: { type: 'string' } },
    actionLink: { type: 'string' },
    frictionDetected: { type: 'boolean' },
    shouldDisplay: { type: 'boolean' }
  },
  required: ['category', 'priority', 'intent', 'summary', 'actionItems', 'frictionDetected', 'shouldDisplay']
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

  REGLAS DE FILTRADO (shouldDisplay: false):
  - TODO correo automático de sistema (DIAN, tokens de acceso, newsletters, promociones).
  - Notificaciones de Figma (a menos que mencionen un 'blocking comment').
  - Confirmaciones de calendario rutinarias ('Accepted', 'Updated invitation').

  REGLAS DE PRIORIDAD (Matriz Dinámica):
  - HIGH:
    1. Si detectas fricción (quejas, insatisfacción, reclamos).
    2. Urgencia temporal explícita ("para hoy", "ASAP", "urgente").
    3. Si el emisor es un cliente estratégico pidiendo cambios en entregables de hoy.
  - MEDIUM: Tareas estándar, notificaciones de Basecamp de nuevos proyectos, feedback constructivo.
  - LOW: Acuses de recibo, informativos que no requieren acción.

  EXTRACCIÓN DE DATOS:
  1. intent: Clasifica la intención (ej. 'Cambio solicitado por cliente', 'Asignación de tarea', 'Aprobación recibida').
  2. actionItems: Lista los sub-pasos accionables.
  3. actionLink: Busca un link de acción directa mencionado en el correo.
  4. frictionDetected: true si el tono es de reclamo o urgencia por error.

  EMAIL:
  From: ${email.from || ''}
  Subject: ${email.subject || ''}
  Snippet: ${email.snippet || ''}`;

  try {
    const result = await genAI.models.generateContent({
      model: TRIAGE_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: TRIAGE_SCHEMA
        }
      }
    });

    const text = result.text;
    const triage = normalizeModelJson(text);
    return { ...email, triage };
  } catch (error) {
    console.error(`[EmailTriage] Deep Extraction Error for email ${email.id}:`, error.message);

    const content = `${email.from} ${email.subject} ${email.snippet}`.toLowerCase();
    const isBasecamp = content.includes('basecamp') || content.includes('3.basecamp.com');
    const isBot = content.includes('noreply') || content.includes('no-reply') || content.includes('calendar-notification') || content.includes('dian.gov.co');

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
        frictionDetected: false,
        shouldDisplay: !isBot
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
        return !c.includes('noreply') && !c.includes('calendar') && !c.includes('dian');
    }).map(e => ({
      ...e,
      triage: {
        category: 'CLIENT_COMMUNICATION',
        priority: 'MEDIUM',
        intent: 'Informativo',
        summary: e.subject,
        actionItems: [],
        frictionDetected: false,
        shouldDisplay: true
      }
    }));
  }
};

export const onlyBasecampEmails = (emails) => emails.filter((email) => email.triage?.category === 'BASECAMP');
