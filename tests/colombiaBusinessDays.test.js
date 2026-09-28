import test from 'node:test';
import assert from 'node:assert/strict';
import {
    addBusinessDays,
    bogotaDate,
    businessDaysUntil,
    colombianHolidays,
    easterSunday,
    isBusinessDay
} from '../src/lib/colombiaBusinessDays.js';

// Días hábiles de Colombia (27 de septiembre de 2026). Los plazos de la Ley 1581 y del reporte
// de incidentes a la SIC se cuentan en días hábiles: sin festivos, un plazo vencería antes.

test('calcula el domingo de Pascua', () => {
    assert.equal(easterSunday(2024), '2024-03-31');
    assert.equal(easterSunday(2025), '2025-04-20');
    assert.equal(easterSunday(2026), '2026-04-05');
    assert.equal(easterSunday(2027), '2027-03-28');
});

test('los 18 festivos de 2026, con los trasladados a lunes por la Ley Emiliani', () => {
    assert.deepEqual([...colombianHolidays(2026)].sort(), [
        '2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03', '2026-05-01',
        '2026-05-18', '2026-06-08', '2026-06-15', '2026-06-29', '2026-07-20', '2026-08-07',
        '2026-08-17', '2026-10-12', '2026-11-02', '2026-11-16', '2026-12-08', '2026-12-25'
    ]);
});

test('los festivos de 2025 también cuadran', () => {
    const holidays = colombianHolidays(2025);
    for (const day of ['2025-01-06', '2025-03-24', '2025-04-17', '2025-04-18', '2025-06-02', '2025-06-23', '2025-06-30', '2025-08-18', '2025-10-13', '2025-11-03', '2025-11-17']) {
        assert.ok(holidays.has(day), `falta ${day}`);
    }
    // En 2025 el Sagrado Corazón y San Pedro y San Pablo cayeron el mismo lunes 30 de junio.
    assert.equal(holidays.size, 17);
});

test('fines de semana y festivos no son hábiles', () => {
    assert.equal(isBusinessDay('2026-09-25'), true, 'viernes');
    assert.equal(isBusinessDay('2026-09-26'), false, 'sábado');
    assert.equal(isBusinessDay('2026-09-27'), false, 'domingo');
    assert.equal(isBusinessDay('2026-10-12'), false, 'festivo');
});

test('el plazo empieza a contar el día hábil siguiente al recibo', () => {
    // Recibida el lunes 28 de septiembre de 2026: 10 hábiles saltando el festivo del 12 de octubre.
    assert.equal(addBusinessDays('2026-09-28', 10), '2026-10-13');
    // Recibida un sábado: cuenta desde el lunes.
    assert.equal(addBusinessDays('2026-09-26', 1), '2026-09-28');
    // 15 hábiles desde el 28 de septiembre de 2026.
    assert.equal(addBusinessDays('2026-09-28', 15), '2026-10-20');
    // Prórroga: 5 hábiles más desde el vencimiento.
    assert.equal(addBusinessDays('2026-10-13', 5), '2026-10-20');
    // Semana Santa 2026.
    assert.equal(addBusinessDays('2026-03-31', 2), '2026-04-06');
});

test('días hábiles restantes: positivos antes, cero el día del vencimiento, negativos después', () => {
    assert.equal(businessDaysUntil('2026-10-13', '2026-10-09'), 1, 'viernes → martes, con el lunes festivo');
    assert.equal(businessDaysUntil('2026-10-13', '2026-10-13'), 0);
    assert.equal(businessDaysUntil('2026-10-13', '2026-10-15'), -2);
});

test('la fecha de Bogotá no se corre por la zona horaria', () => {
    assert.equal(bogotaDate(new Date('2026-09-28T03:00:00Z')), '2026-09-27', 'las 10 p. m. del 27 en Bogotá');
    assert.equal(bogotaDate(new Date('2026-09-28T05:00:00Z')), '2026-09-28');
});
