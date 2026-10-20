// Resumen de ajustes de cartera (Rodny, 20 de octubre de 2026): lo que se saldó sin dinero
// —acuerdo, canje, compensación, condonación— y la diferencia en cambio de las cuentas en
// dólares, cuya cartera en pesos se ajusta a lo que de verdad entró. Nada de esto es un
// movimiento: no entró ni salió dinero por estos conceptos, y por eso no aparece en
// Movimientos; aparece aquí, para que quien lleva el financiero lo vea de una vez.
import { SETTLEMENT_KINDS } from './receivableSettlement.js';

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

// Todo el año, o un mes. Las fechas se comparan en UTC, como el resto del financiero.
export const adjustmentsRange = ({ year, month } = {}) => {
    const parsedYear = Number.parseInt(year, 10);
    const parsedMonth = Number.parseInt(month, 10);
    if (Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12) {
        return { from: new Date(Date.UTC(parsedYear, parsedMonth - 1, 1)), to: new Date(Date.UTC(parsedYear, parsedMonth, 1)) };
    }
    return { from: new Date(Date.UTC(parsedYear, 0, 1)), to: new Date(Date.UTC(parsedYear + 1, 0, 1)) };
};

export const summarizeAdjustments = ({ settlements = [], exchangeAdjustments = [] } = {}) => {
    const byKind = Object.fromEntries(SETTLEMENT_KINDS.map((kind) => [kind.value, { total: 0, count: 0 }]));
    let settledTotal = 0;
    for (const settlement of settlements) {
        const bucket = byKind[settlement.kind];
        if (!bucket) continue;
        bucket.total = round(bucket.total + Number(settlement.amount || 0));
        bucket.count += 1;
        settledTotal = round(settledTotal + Number(settlement.amount || 0));
    }
    const exchange = { up: 0, down: 0, net: 0, count: 0 };
    for (const adjustment of exchangeAdjustments) {
        const difference = round((Number(adjustment.toCents) - Number(adjustment.fromCents)) / 100);
        if (difference > 0) exchange.up = round(exchange.up + difference);
        if (difference < 0) exchange.down = round(exchange.down - difference);
        exchange.count += 1;
    }
    exchange.net = round(exchange.up - exchange.down);
    return { byKind, settledTotal, exchange };
};
