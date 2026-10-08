// Prototype only: live Google collectors and scheduling have not been connected.
export const applySourceSync = async ({ batch, repository, commitCursor }) => {
  if (batch.account !== 'social.brainstudio@gmail.com' || batch.verified !== true) throw new Error('La cuenta de sincronización no está verificada.');
  if (batch.complete !== true || !batch.cursor?.drive || !batch.cursor?.gmail) throw new Error('La lectura de cambios no está completa.');
  let updated = 0, unchanged = 0, excluded = 0;
  for (const entry of batch.actions || []) {
    if (entry.action === 'UPSERT' && entry.source?.status === 'indexed') {
      const result = await repository.importSource(entry.source);
      result.changed ? updated++ : unchanged++;
    } else if (entry.action === 'EXCLUDE' && Array.isArray(entry.ids)) {
      await repository.excludeSources(entry.ids); excluded += entry.ids.length;
    } else throw new Error('Cambio de fuente desconocido.');
  }
  // Retrying after a partial database failure is safe: source digests are idempotent.
  await commitCursor(batch.cursor);
  return { updated, unchanged, excluded };
};
