import { mkdirSync, writeFileSync } from 'node:fs';
import { generateReceivablePdfBuffer } from '../src/services/receivablePdfService.js';

// Muestra local del PDF de la cuenta de cobro, con los datos de la cuenta real
// No. 0389 (Corporación Deportiva Los Titanes) que Rodny pasó el 22 de septiembre de
// 2026. Sirve para mirar el documento al tocar la plantilla sin emitir nada: no toca
// la base de datos ni el bucket. `npm run preview:cuenta-de-cobro`

const receivable = {
    id: 'muestra',
    number: 389,
    issuedAt: '2026-09-21T12:00:00.000Z',
    amount: 1200000,
    servicePeriod: '20 de agosto al 19 de septiembre',
    concept: [
        'Prestación de servicios para el diseño y ejecución de estrategias de comunicación digital para la marca, con el objetivo de visibilizar, posicionar y promocionar los servicios y productos que ofrecen en las diferentes redes sociales. Este servicio incluye:',
        '- Planeación mensual de contenidos (parrilla) con enfoque estratégico',
        '- Definición de línea visual y narrativa de marca',
        '- 6 contenidos mensuales distribuidos así: 3 videos tipo reels, 2 post, 1 carrusel.',
        '- 4 historias mensuales.',
        '- Copywriting profesional orientado a atracción y conversión.',
        '- 1 jornada mensual de producción audiovisual (2 horas) para generación de contenido.',
        '- Administración y gestión de pauta digital.'
    ].join('\n'),
    items: [
        { description: 'Fee mensual', amount: 800000 },
        { description: 'Inversión de pauta en Meta Ads', amount: 400000 }
    ],
    client: {
        name: 'Titanes',
        legalName: 'CORPORACIÓN DEPORTIVA LOS TITANES',
        documentType: 'NIT',
        documentNumber: '901378858'
    }
};

// El mes normal es de un solo concepto, y entonces el documento no lleva tabla:
// así es el de Elvira Utria.
const unConcepto = {
    ...receivable,
    id: 'muestra-simple',
    number: 366,
    amount: 800000,
    items: [{ description: 'Fee mensual', amount: 800000 }],
    client: { name: 'Elvira', legalName: 'ELVIRA UTRIA', documentType: 'CC', documentNumber: '33.333.333' }
};

mkdirSync('output', { recursive: true });
for (const muestra of [receivable, unConcepto]) {
    const file = `output/cuenta-de-cobro-${String(muestra.number).padStart(4, '0')}.pdf`;
    writeFileSync(file, generateReceivablePdfBuffer(muestra));
    console.log(file);
}
