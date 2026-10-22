-- Bria aprende de los chats (Rodny, 20 de octubre de 2026: «que las cosas que se hablan en el chat ella las vaya
-- asumiendo, aprendiendo, guardando, razonando»). Esquema aditivo e idempotente, fuera de Prisma.
CREATE SCHEMA IF NOT EXISTS bria_memory;
-- Un hecho puede venir ahora de una conversación con el equipo: origen CONVERSACION, con certeza «así se trabaja» o
-- «propuesta», nunca «confirmado» (eso sigue siendo lo que el equipo dice a propósito).
ALTER TABLE bria_memory.agency_facts DROP CONSTRAINT IF EXISTS agency_facts_origin_check;
ALTER TABLE bria_memory.agency_facts ADD CONSTRAINT agency_facts_origin_check CHECK (origin IN ('LECTURA','EQUIPO','CONVERSACION'));
-- Una lectura por día: qué noche se leyó, cuántas conversaciones y cuántos hechos dejó. Reclamar el día evita que dos
-- réplicas o un reinicio lo lean dos veces; una lectura que no terminó en dos horas se puede volver a reclamar.
CREATE TABLE IF NOT EXISTS bria_memory.conversation_learning_runs (
  day_key TEXT PRIMARY KEY CHECK (day_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  conversations INTEGER NOT NULL DEFAULT 0,
  facts INTEGER NOT NULL DEFAULT 0,
  usage JSONB
);
