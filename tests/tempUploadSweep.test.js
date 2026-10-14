import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_TEMP_RETENTION_DAYS,
    TEMP_PREFIX,
    sweepTempUploads,
    tempPurgeDecision,
    tempRetentionDaysFrom,
    tempSweepEnabled
} from '../src/services/tempUploadRetentionService.js';

// Limpieza de `temp/` (Rodny, 14 de octubre de 2026: «sí, arregla lo de temp»).
//
// `POST /api/tasks/upload-temp` sube el archivo **antes** de que la tarea exista, para
// poder adjuntarlo a un borrador. Los que acaban en una tarea quedan referenciados por
// `TaskAttachment.url`; los de un formulario que alguien abandonó no los borra nadie y la
// carpeta dice «temp» como si fueran pasajeros. Medido el 14 de octubre de 2026: 75
// archivos, 42 referenciados, **31 huérfanos con más de 7 días y 49,2 MB**, ninguno
// citado dentro del texto de una tarea o un comentario.
//
// Como los bytes borrados no vuelven, **toda comprobación falla del lado de conservar**.

const AHORA = new Date('2026-10-14T12:00:00.000Z');
const haceDias = (n) => new Date(AHORA.getTime() - n * 24 * 3600 * 1000);
const objeto = (key, dias) => ({ Key: key, LastModified: haceDias(dias), Size: 1024 });

test('el interruptor solo se enciende con la palabra exacta', () => {
    assert.equal(tempSweepEnabled({ TEMP_UPLOAD_SWEEP_ENABLED: 'true' }), true);
    for (const valor of ['TRUE', '1', 'yes', 'sí', '', undefined]) {
        assert.equal(tempSweepEnabled({ TEMP_UPLOAD_SWEEP_ENABLED: valor }), false, `«${valor}» no debería encenderlo`);
    }
    assert.equal(tempSweepEnabled({}), false, 'sin variable, apagado');
});

test('los días salen de la configuración y nunca bajan de uno', () => {
    assert.equal(tempRetentionDaysFrom({}), DEFAULT_TEMP_RETENTION_DAYS);
    assert.equal(tempRetentionDaysFrom({ TEMP_UPLOAD_SWEEP_DAYS: '30' }), 30);
    assert.equal(tempRetentionDaysFrom({ TEMP_UPLOAD_SWEEP_DAYS: '0' }), DEFAULT_TEMP_RETENTION_DAYS);
    assert.equal(tempRetentionDaysFrom({ TEMP_UPLOAD_SWEEP_DAYS: 'pronto' }), DEFAULT_TEMP_RETENTION_DAYS);
});

test('un archivo viejo y sin referencia se borra', () => {
    const decision = tempPurgeDecision(objeto('temp/123_abc_borrador.pdf', 10), { now: AHORA, referenced: false });
    assert.equal(decision.purge, true);
});

test('un archivo referenciado por una tarea nunca se toca, por viejo que sea', () => {
    const decision = tempPurgeDecision(objeto('temp/123_abc_insumo.pdf', 400), { now: AHORA, referenced: true });
    assert.equal(decision.purge, false);
    assert.equal(decision.reason, 'referenced');
});

// Alguien puede estar con el formulario abierto desde ayer.
test('un archivo reciente se respeta aunque no esté referenciado', () => {
    assert.equal(tempPurgeDecision(objeto('temp/x.pdf', 1), { now: AHORA, referenced: false }).purge, false);
    assert.equal(tempPurgeDecision(objeto('temp/x.pdf', 6.9), { now: AHORA, referenced: false }).reason, 'too-recent');
});

test('nada fuera de temp/ entra en el barrido', () => {
    for (const key of ['content-plans/a.png', 'clientes/x/tareas/y/z.pdf', 'team-chat/a.jpg', 'temporal/a.pdf']) {
        const decision = tempPurgeDecision({ ...objeto(key, 90) }, { now: AHORA, referenced: false });
        assert.equal(decision.purge, false, `${key} no debería borrarse`);
        assert.equal(decision.reason, 'not-temp');
    }
});

test('un objeto incompleto se conserva', () => {
    assert.equal(tempPurgeDecision(null, { now: AHORA }).purge, false);
    assert.equal(tempPurgeDecision({ Key: 'temp/a.pdf' }, { now: AHORA, referenced: false }).purge, false, 'sin fecha no se puede decidir');
    assert.equal(tempPurgeDecision({ LastModified: haceDias(90) }, { now: AHORA }).purge, false, 'sin nombre tampoco');
});

// --- El barrido completo, con dobles ---

const dobles = ({ objetos, urls, fallaLaLectura = false, borrar }) => ({
    storage: {
        list: async () => objetos,
        remove: async (key) => borrar(key)
    },
    db: {
        taskAttachment: {
            findMany: async () => {
                if (fallaLaLectura) throw new Error('base caída');
                return urls.map(url => ({ url }));
            }
        }
    }
});

test('el barrido borra solo los huérfanos viejos', async () => {
    const borrados = [];
    const { storage, db } = dobles({
        objetos: [
            objeto('temp/1_a_usado.pdf', 30),
            objeto('temp/2_b_huerfano.pdf', 30),
            objeto('temp/3_c_reciente.pdf', 2)
        ],
        urls: ['https://x.test/temp/1_a_usado.pdf'],
        borrar: key => borrados.push(key)
    });

    const resultado = await sweepTempUploads({ storage, db, now: AHORA });
    assert.deepEqual(borrados, ['temp/2_b_huerfano.pdf']);
    assert.equal(resultado.purged, 1);
    assert.equal(resultado.kept, 2);
});

// Si no se puede saber qué está referenciado, no se borra nada: es la diferencia entre
// limpiar y perder el insumo de una tarea.
test('si la base no responde no se borra nada', async () => {
    const borrados = [];
    const { storage, db } = dobles({
        objetos: [objeto('temp/viejo.pdf', 90)],
        urls: [],
        fallaLaLectura: true,
        borrar: key => borrados.push(key)
    });

    const resultado = await sweepTempUploads({ storage, db, now: AHORA });
    assert.deepEqual(borrados, []);
    assert.equal(resultado.purged, 0);
    assert.ok(resultado.error, 'tiene que decir por qué no hizo nada');
});

test('en simulación cuenta pero no borra', async () => {
    const borrados = [];
    const { storage, db } = dobles({
        objetos: [objeto('temp/viejo.pdf', 90)],
        urls: [],
        borrar: key => borrados.push(key)
    });

    const resultado = await sweepTempUploads({ storage, db, now: AHORA, dryRun: true });
    assert.deepEqual(borrados, []);
    assert.equal(resultado.purged, 1, 'dice cuántos borraría');
    assert.equal(resultado.dryRun, true);
});

test('un fallo al borrar un archivo no frena a los demás', async () => {
    const borrados = [];
    const { storage, db } = dobles({
        objetos: [objeto('temp/a.pdf', 30), objeto('temp/b.pdf', 30)],
        urls: [],
        borrar: key => { if (key.endsWith('a.pdf')) throw new Error('almacenamiento'); borrados.push(key); }
    });

    const resultado = await sweepTempUploads({ storage, db, now: AHORA });
    assert.deepEqual(borrados, ['temp/b.pdf']);
    assert.equal(resultado.purged, 1);
    assert.equal(resultado.failed, 1);
});

test('el prefijo es el de verdad', () => {
    assert.equal(TEMP_PREFIX, 'temp/');
});
