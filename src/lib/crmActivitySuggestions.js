const normalized = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/\s+/g, ' ').trim();

// Se conservan las palabras originales. No se generan ni registran hechos al sugerir.
export function frequentActivityNotes(rows) {
  const grouped = new Map();
  for (const { note } of rows) {
    if (typeof note !== 'string' || !note.trim() || note.length > 2000) continue;
    const key = normalized(note);
    const entry = grouped.get(key) || { text: note.trim(), count: 0, recent: grouped.size };
    entry.count += 1; grouped.set(key, entry);
  }
  return [...grouped.values()].sort((a,b) => b.count - a.count || a.recent - b.recent).slice(0,100).map(entry => entry.text);
}
export function matchActivityNotes(values, prefix) {
  const key = normalized(prefix);
  if (key.length < 3) return [];
  return values.filter(value => normalized(value).startsWith(key) && normalized(value) !== key).slice(0,4);
}
