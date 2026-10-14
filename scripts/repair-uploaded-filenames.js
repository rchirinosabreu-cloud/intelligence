#!/usr/bin/env node
// Repara los nombres de archivo que se guardaron mal leídos (Rodny, 14 de octubre de
// 2026). Hasta hoy la plataforma leía el nombre byte a byte, así que «Gestión» quedó
// guardado como «GestiÃ³n». El defecto ya está corregido en la puerta
// (src/lib/uploadStorage.js); esto arregla lo que quedó escrito antes.
//
// **Simula por defecto.** Escribe solo con `--confirmar CORREGIR`.
// Solo toca filas cuyo nombre cambia al corregirlo; el resto no se lee ni se escribe.
// Nunca toca la clave de almacenamiento: el archivo en el bucket no se mueve.

import { PrismaClient } from '@prisma/client';
import { decodeUploadedFilename } from '../src/lib/uploadFilename.js';

const db = new PrismaClient();
const confirmar = process.argv.includes('--confirmar') && process.argv[process.argv.indexOf('--confirmar') + 1] === 'CORREGIR';

// Cada tabla con su columna de nombre visible. Añadir aquí una tabla nueva si guarda
// nombres de archivo subidos por una persona.
const TABLAS = [
    { nombre: 'Drive', modelo: 'driveFile', campo: 'name' },
    { nombre: 'Piezas finales de parrilla', modelo: 'contentItemFinalAsset', campo: 'name' },
    { nombre: 'Adjuntos de tareas', modelo: 'taskAttachment', campo: 'name' },
    { nombre: 'Documentos financieros', modelo: 'financialRecordDocument', campo: 'name' }
];

let totalRotos = 0;

for (const tabla of TABLAS) {
    const modelo = db[tabla.modelo];
    if (!modelo) { console.log(`· ${tabla.nombre}: no existe en este esquema, se omite.`); continue; }

    const filas = await modelo.findMany({ select: { id: true, [tabla.campo]: true } });
    const rotas = filas
        .map(fila => ({ id: fila.id, antes: fila[tabla.campo], despues: decodeUploadedFilename(fila[tabla.campo]) }))
        .filter(fila => fila.antes && fila.antes !== fila.despues);

    console.log(`\n${tabla.nombre}: ${rotas.length} de ${filas.length} con el nombre mal leído.`);
    for (const fila of rotas.slice(0, 10)) console.log(`   ${fila.antes}\n → ${fila.despues}`);
    if (rotas.length > 10) console.log(`   … y ${rotas.length - 10} más.`);
    totalRotos += rotas.length;

    if (confirmar) {
        for (const fila of rotas) {
            await modelo.update({ where: { id: fila.id }, data: { [tabla.campo]: fila.despues } });
        }
        if (rotas.length) console.log(`   ✔ ${rotas.length} corregidos.`);
    }
}

console.log(`\nTotal con el nombre mal leído: ${totalRotos}.`);
console.log(confirmar ? 'Corregidos.' : 'Simulación: no se escribió nada. Para corregir: node scripts/repair-uploaded-filenames.js --confirmar CORREGIR');

await db.$disconnect();
