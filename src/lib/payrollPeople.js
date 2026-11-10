export function groupPayrollPeople(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const id = row.partyId ? `party:${row.partyId}` : `collaborator:${row.collaboratorId || row.userId || row.id}`;
    if (!groups.has(id)) groups.set(id, { id, name: row.name, partyId: row.partyId, rows: [], contracts: [] });
    const person = groups.get(id);
    if (!person.avatar && row.avatar) person.avatar = row.avatar;
    person.rows.push(row);
    if (!person.contracts.some(c => c.id === row.id)) person.contracts.push(row);
  }
  return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'es'));
}
