// Días hábiles de Colombia (27 de septiembre de 2026). Los plazos de consultas y reclamos de la
// Ley 1581 de 2012 y el reporte de incidentes a la SIC se cuentan en días hábiles: lunes a
// viernes sin festivos. Festivos según la Ley 51 de 1983 («Ley Emiliani»): unos fijos, otros
// trasladados al lunes siguiente y los que dependen de la Pascua. Fechas como 'YYYY-MM-DD'.

const iso = (date) => date.toISOString().slice(0, 10);
const utc = (year, month, day) => new Date(Date.UTC(year, month - 1, day));
const plusDays = (date, days) => new Date(date.getTime() + days * 86400000);
const nextMonday = (date) => {
    const weekday = date.getUTCDay();
    return weekday === 1 ? date : plusDays(date, (8 - weekday) % 7);
};

// Algoritmo anónimo gregoriano (Meeus/Jones/Butcher).
export const easterSunday = (year) => {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return iso(utc(year, month, day));
};

const cache = new Map();

export const colombianHolidays = (year) => {
    if (cache.has(year)) return cache.get(year);
    const easter = new Date(`${easterSunday(year)}T00:00:00Z`);
    const days = [
        // Fijos.
        utc(year, 1, 1), utc(year, 5, 1), utc(year, 7, 20), utc(year, 8, 7), utc(year, 12, 8), utc(year, 12, 25),
        // Trasladables al lunes siguiente.
        ...[[1, 6], [3, 19], [6, 29], [8, 15], [10, 12], [11, 1], [11, 11]].map(([month, day]) => nextMonday(utc(year, month, day))),
        // Según la Pascua: Jueves y Viernes Santo; Ascensión, Corpus Christi y Sagrado Corazón en lunes.
        plusDays(easter, -3), plusDays(easter, -2), plusDays(easter, 43), plusDays(easter, 64), plusDays(easter, 71)
    ];
    const set = new Set(days.map(iso));
    cache.set(year, set);
    return set;
};

export const isBusinessDay = (day) => {
    const date = new Date(`${day}T00:00:00Z`);
    const weekday = date.getUTCDay();
    return weekday !== 0 && weekday !== 6 && !colombianHolidays(date.getUTCFullYear()).has(day);
};

// El plazo se cuenta desde el día hábil siguiente a la fecha de partida.
export const addBusinessDays = (fromDay, count) => {
    let date = new Date(`${fromDay}T00:00:00Z`);
    let remaining = count;
    while (remaining > 0) {
        date = plusDays(date, 1);
        if (isBusinessDay(iso(date))) remaining -= 1;
    }
    return iso(date);
};

// Hábiles que faltan hasta el vencimiento (0 el mismo día, negativos si ya venció).
export const businessDaysUntil = (dueDay, today) => {
    if (dueDay === today) return 0;
    const forward = dueDay > today;
    let date = new Date(`${forward ? today : dueDay}T00:00:00Z`);
    const end = forward ? dueDay : today;
    let count = 0;
    while (iso(date) < end) {
        date = plusDays(date, 1);
        if (isBusinessDay(iso(date))) count += 1;
    }
    return forward ? count : -count;
};

export const bogotaDate = (value = new Date()) => iso(new Date(new Date(value).getTime() - 5 * 3600000));
