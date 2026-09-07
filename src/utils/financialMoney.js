// Financial operations use integer cents. This is a precision bound, not a
// commercial amount limit; Decimal strings are parsed before conversion to Number.
export const financialCents = (value) => {
    if (value === null || value === undefined || value === '') return null;
    let raw = String(value).trim();
    if (typeof value === 'number') {
        if (!Number.isFinite(value) || value < 0) return null;
        const scaled = value * 100;
        const nearest = Math.round(scaled);
        const tolerance = Math.min(0.000001, Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4);
        if (!Number.isSafeInteger(nearest) || Math.abs(scaled - nearest) > tolerance) return null;
        if ((raw.split('.')[1] || '').replace(/0+$/, '').length > 2) raw = (nearest / 100).toFixed(2);
    }
    const match = /^\+?(\d+)(?:\.(\d*))?$/.exec(raw);
    if (!match) return null;
    const fractional = (match[2] || '').replace(/0+$/, '');
    if (fractional.length > 2) return null;
    const cents = BigInt(match[1]) * 100n + BigInt(fractional.padEnd(2, '0'));
    return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
};

export const financialAmountFromCents = (cents) => {
    if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError('Financial cents must be a nonnegative safe integer.');
    const decimal = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
    const number = Number(decimal);
    // Prisma accepts either form; retain the exact final cent at large magnitudes.
    return financialCents(number) === cents ? number : decimal;
};
