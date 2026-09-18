import { es } from 'date-fns/locale';
import { registerLocale } from 'react-datepicker';

registerLocale('es', es);

export const brainDatePickerProps = {
  locale: 'es',
  calendarClassName: 'brain-datepicker',
  popperClassName: 'brain-datepicker-popper',
  showPopperArrow: false
};

// ---- plain-text value helpers shared by BrainDatePicker / BrainDateTimePicker -------------------------

const pad = value => String(value).padStart(2, '0');
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** 'YYYY-MM-DD' → local-noon Date (noon avoids DST edges); anything else → null. */
export const dateKeyToPickerDate = value => {
  const match = DATE_KEY.exec(String(value || ''));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Date → 'YYYY-MM-DD' from the calendar day the picker shows (local fields, never UTC). */
export const pickerDateToKey = date => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const splitDateTimeKey = value => {
  const [dateKey = '', time = ''] = String(value || '').split('T');
  return { dateKey: DATE_KEY.test(dateKey) ? dateKey.slice(0, 10) : '', time: TIME.test(time.slice(0, 5)) ? time.slice(0, 5) : '' };
};

export const joinDateTimeKey = (dateKey, time) => (dateKey && time ? `${dateKey}T${time}` : '');

export const formatDateTimeText = (dateKey, time) => {
  const date = dateKeyToPickerDate(dateKey);
  return date ? `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}${time ? ` ${time}` : ''}` : '';
};

/** 'DD/MM/YYYY[ HH:mm]' typed by hand → { dateKey, time } or null when it is not a real date. */
export const parseDateTimeText = raw => {
  const match = String(raw || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+([01]\d|2[0-3]):([0-5]\d))?$/);
  if (!match) return null;
  const dateKey = pickerDateToKey(new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12));
  if (!dateKey || dateKey !== `${match[3]}-${match[2]}-${match[1]}`) return null;
  return { dateKey, time: match[4] ? `${match[4]}:${match[5]}` : '' };
};

export const QUARTER_HOURS = Array.from({ length: 96 }, (_, index) => `${pad(Math.floor(index / 4))}:${pad((index % 4) * 15)}`);
