export const firefliesMinutesToSeconds = (minutes) => {
  const numericMinutes = Number(minutes);
  if (!Number.isFinite(numericMinutes) || numericMinutes <= 0) return null;
  return Math.round(numericMinutes * 60);
};

export const formatMeetingDuration = (seconds) => {
  const numericSeconds = Number(seconds);
  if (!Number.isFinite(numericSeconds) || numericSeconds <= 0) return '';

  const totalMinutes = Math.max(1, Math.round(numericSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return [hours ? `${hours} h` : '', minutes ? `${minutes} min` : ''].filter(Boolean).join(' ');
};

export const getReportedMeetingDuration = (files = []) => {
  const meeting = files.find(file => file?.type === 'meeting' && file?.duration != null);
  return meeting ? formatMeetingDuration(firefliesMinutesToSeconds(meeting.duration)) : '';
};
