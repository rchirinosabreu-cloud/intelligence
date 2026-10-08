export const sourceSearchChunks = (value, size = 7000) => {
  const body = String(value || '').toWellFormed(), chunks = [];
  for (let start = 0; start < body.length;) {
    let end = Math.min(start + size, body.length);
    const last = body.charCodeAt(end - 1);
    if (end < body.length && last >= 0xD800 && last <= 0xDBFF) end--;
    chunks.push({ position: chunks.length, content: body.slice(start, end) }); start = end;
  }
  return chunks;
};
