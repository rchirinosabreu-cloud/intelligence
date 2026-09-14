const calendarFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function getAnnouncementWeek(now = new Date()) {
  const parts = Object.fromEntries(calendarFormatter.formatToParts(now).map(part => [part.type, part.value]));
  // Bogota is UTC-5. Construct the boundary without using the browser's timezone.
  const monday = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 5));
  const offset = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - offset);
  const end = new Date(monday);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start: monday.getTime(), end: end.getTime() };
}

export function announcementsInWeek(announcements, week) {
  return announcements.filter(announcement => {
    const createdAt = new Date(announcement.createdAt).getTime();
    return createdAt >= week.start && createdAt < week.end;
  });
}
