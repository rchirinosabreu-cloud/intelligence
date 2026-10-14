#!/usr/bin/env node
// Barre los archivos huérfanos de `temp/` (Rodny, 14 de octubre de 2026).
//
// `temp/` recibe lo que se adjunta a una tarea **antes** de que la tarea exista. Lo que
// acaba en una tarea queda referenciado en `TaskAttachment.url`; lo de un formulario
// abandonado no lo borra nadie.
//
// **Simula por defecto.** Borra solo con `--confirmar LIMPIAR`.
// Nunca toca un archivo referenciado, uno de menos de 7 días, ni nada fuera de `temp/`;
// y si no puede leer la base, no borra nada.

import { sweepTempUploads, tempRetentionDaysFrom, TEMP_PREFIX } from '../src/services/tempUploadRetentionService.js';
import { listS3Objects } from '../src/services/s3Service.js';
import prisma from '../src/lib/prisma.js';

const confirmar = process.argv.includes('--confirmar') && process.argv[process.argv.indexOf('--confirmar') + 1] === 'LIMPIAR';
const dias = tempRetentionDaysFrom();

const objetos = await listS3Objects(TEMP_PREFIX);
const peso = objetos.reduce((total, o) => total + (o.Size || 0), 0);
console.log(`${TEMP_PREFIX}: ${objetos.length} archivos · ${(peso / 1024 / 1024).toFixed(1)} MB · se conservan los de menos de ${dias} días\n`);

const resultado = await sweepTempUploads({ dryRun: !confirmar, retentionDays: dias });

if (resultado.error) {
    console.log(`No se barrió nada: ${resultado.error}`);
} else if (confirmar) {
    console.log(`Borrados: ${resultado.purged} · conservados: ${resultado.kept} · fallidos: ${resultado.failed}`);
} else {
    console.log(`Se borrarían: ${resultado.purged} · se conservarían: ${resultado.kept}`);
    console.log('\nSimulación: no se borró nada. Para limpiar: node scripts/sweep-temp-uploads.js --confirmar LIMPIAR');
}

await prisma.$disconnect();
