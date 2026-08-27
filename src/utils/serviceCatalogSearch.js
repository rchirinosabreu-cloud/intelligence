export const normalizeServiceSearchText = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es')
  .replace(/\s+/g, ' ')
  .trim();

export const matchesServiceSearch = (service, query) => {
  const normalizedQuery = normalizeServiceSearchText(query);
  if (!normalizedQuery) return true;

  const searchableText = normalizeServiceSearchText([
    service?.name,
    service?.description,
    service?.category
  ].filter(Boolean).join(' '));

  return normalizedQuery
    .split(' ')
    .filter(Boolean)
    .every((term) => searchableText.includes(term));
};
