export const knowledgeError = (message, status = 400, code = 'BRIA_KNOWLEDGE_INVALID') => Object.assign(new Error(message), { status, code });
export const learningKey = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const date = value => {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw knowledgeError('Indica una fecha válida.');
  return value;
};
export const validateLearning = input => {
  if (!['AGENCY', 'ACCOUNT', 'PERSONAL'].includes(input?.scope)) throw knowledgeError('Elige a quién aplica el aprendizaje.');
  if (!['CONFIRMED', 'PROPOSAL'].includes(input.kind)) throw knowledgeError('Indica si es una decisión confirmada o una propuesta.');
  const topic = String(input.topic || '').trim(), text = String(input.text || '').trim();
  if (!topic || topic.length > 120 || !text || text.length > 2000) throw knowledgeError('Escribe un tema y un aprendizaje de hasta 2.000 caracteres.');
  if (/(?:password|contrase(?:ña|na)|api[_ -]?key|refresh[_ -]?token|client[_ -]?secret|access[_ -]?token)\s*[:=]\s*\S+|\bsk-[a-zA-Z0-9_-]{12,}|-----BEGIN .*PRIVATE KEY-----/i.test(text)) throw knowledgeError('Las credenciales no se guardan como aprendizajes de negocio.');
  const entity = input.scope === 'AGENCY' ? 'Brainstudio' : input.scope === 'PERSONAL' ? 'Personal' : String(input.entity || '').trim();
  if (!entity || entity.length > 160) throw knowledgeError('Indica la cuenta a la que aplica.');
  const validFrom = date(input.validFrom), validUntil = input.validUntil ? date(input.validUntil) : null;
  if (validUntil && validUntil < validFrom) throw knowledgeError('La vigencia termina antes de empezar.');
  return { scope: input.scope, entity, topic, text, kind: input.kind, validFrom, validUntil };
};
export const learningVisible = (row, actor) => row.scope === 'PERSONAL' ? row.subjectRef === actor.ref : row.scope === 'AGENCY' || actor.role === 'ADMIN' || (actor.accountIds || []).includes(row.entity);
export const learningUsable = (row, today) => row.kind === 'CONFIRMED' && row.status === 'ACTIVE' && row.validFrom <= today && (!row.validUntil || row.validUntil >= today);
export const bogotaDay = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(now);
