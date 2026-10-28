// Gestiones de cobro (Rodny, 28 de octubre de 2026: «eso debe quedar guardado en algún lugar, esas elecciones de
// gestión. Debe haber un registro»). Lo que Elisa hizo para cobrar —le escribió, lo llamó, el cliente respondió— queda
// en la cuenta del cliente y se ve en Cuentas por cobrar. Los canales son los mismos de la banda.
//
// Lógica pura: la usan el servidor, la pantalla y las pruebas.
import { FOLLOW_UP_CHANNELS } from './importantNotices.js';

export const COLLECTION_CHANNELS = FOLLOW_UP_CHANNELS;

export const isCollectionChannel = (value) => COLLECTION_CHANNELS.some((channel) => channel.value === value);
export const collectionChannelLabel = (value) => COLLECTION_CHANNELS.find((channel) => channel.value === value)?.label || 'Gestión';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const bogotaDay = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const [year, month, day] = date.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).split('-');
    return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
};

/** «WhatsApp · 28 oct 2026 · Elisa Mestra»: canal, día de Bogotá y quién. */
export const collectionActivityLine = (item) => [collectionChannelLabel(item.channel), bogotaDay(item.occurredAt), item.authorName]
    .filter(Boolean).join(' · ');
