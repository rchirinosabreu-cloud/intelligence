import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';
import { LEGAL_ENTITY } from '../src/components/public/legalEntity.js';
import { PRIVACY_POLICY_VERSION } from '../src/lib/privacyPolicy.js';

// Páginas legales (Rodny, 27 de septiembre de 2026). La política de datos es obligatoria por
// la Ley 1581 de 2012 y la leen los evaluadores de licitaciones: tiene que nombrar al
// responsable, los derechos, los plazos legales y a los proveedores reales.

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('el responsable es la sociedad, con NIT, domicilio y teléfono reales', () => {
    assert.equal(LEGAL_ENTITY.name, 'BRAIN STUDIO AGENCIA CREATIVA S.A.S.');
    assert.equal(LEGAL_ENTITY.nit, '901533409-4');
    assert.match(LEGAL_ENTITY.address, /Calle 64 # 17A-16.*Daniel Lemaitre.*Cartagena/);
    assert.equal(LEGAL_ENTITY.phone, '+57 323 6917177');
    assert.equal(LEGAL_ENTITY.phoneHref, 'tel:+573236917177');
});

test('la política de datos cumple el contenido mínimo del Decreto 1074 de 2015', async () => {
    const page = await read('src/components/public/PrivacyPolicy.jsx');
    for (const expected of [
        'Ley Estatutaria 1581 de 2012', 'Decreto 1074 de 2015', 'Circular Externa 002 de 2024',
        'Responsable del tratamiento', 'Encargado del tratamiento', 'Finalidades',
        'conocer, actualizar y rectificar', 'revocar la autorización', 'Superintendencia de Industria y Comercio',
        '10 días hábiles', '5 días hábiles', '15 días hábiles', '8 días hábiles', 'reclamo en trámite',
        'área de protección de datos', 'Vigencia', 'PRIVACY_POLICY_VERSION'
    ]) {
        assert.ok(page.includes(expected), `Falta en la política: ${expected}`);
    }
    assert.match(PRIVACY_POLICY_VERSION, /^2\.8 · 2026-10-08$/);
    assert.match(page, /dictado/);
    assert.match(page, /archivos adjuntos/);
});

test('la política explica el historial y la memoria conversacional de Bria', async () => {
    const page = await read('src/components/public/PrivacyPolicy.jsx');
    for (const detail of ['conversaciones con Bria', 'correcciones', 'historial', 'retirar', 'no entrena']) assert.ok(page.includes(detail), detail);
    for (const detail of ['sin papelera', 'pendientes de eliminación', 'se conservan por separado', 'almacenamiento privado dedicado']) assert.ok(page.includes(detail), detail);
    for (const detail of ['crear pendientes', 'comentario inicial', 'confirmar el resumen', 'borrar el chat no elimina']) assert.ok(page.includes(detail), detail);
});

// Contrastado con el texto oficial (Función Pública, 28 de septiembre de 2026): el art. 25 de la
// Ley 1581 es el Registro Nacional de Bases de Datos, no las transferencias; las transmisiones
// a encargados las regulan los arts. 24 y 25 del Decreto 1377 de 2013. Y el art. 10 no exime de
// autorización a «lo necesario para cumplir un contrato»: sus casos son otros cinco.
test('la política cita los artículos que de verdad dicen lo que afirma', async () => {
    const page = await read('src/components/public/PrivacyPolicy.jsx');
    assert.doesNotMatch(page, /artículos 25 y 26 de la Ley 1581/);
    assert.match(page, /artículo 26 de la Ley 1581 de 2012/);
    assert.match(page, /artículos 24 y 25 del Decreto 1377 de 2013/);
    assert.doesNotMatch(page, /necesarios para cumplir un contrato o una obligación legal/);
    for (const exception of ['orden judicial', 'naturaleza pública', 'urgencia médica o sanitaria', 'históricos, estadísticos o científicos', 'Registro Civil']) {
        assert.ok(page.includes(exception), `Falta la excepción del art. 10: ${exception}`);
    }
});

test('la política nombra a los proveedores que de verdad reciben datos y el uso de IA', async () => {
    const page = await read('src/components/public/PrivacyPolicy.jsx');
    for (const provider of ['Railway', 'OpenAI', 'Google', 'Fireflies']) assert.ok(page.includes(provider), `Falta el proveedor ${provider}`);
    assert.match(page, /no usa la información enviada para entrenar/);
    assert.match(page, /Supervisión humana/);
    assert.match(page, /no vende ni alquila datos personales/);
});

test('la política ya no describe una plataforma que no existe', async () => {
    const page = await read('src/components/public/PrivacyPolicy.jsx');
    assert.doesNotMatch(page, /BrainStudio Metrics/, 'nombre de producto antiguo');
    assert.doesNotMatch(page, /Última actualización: Febrero de 2025/);
    assert.doesNotMatch(page, /utiliza la API de Meta/, 'la frase antigua describía un uso que no existía');
    // Desde el 29 de septiembre de 2026 la plataforma sí publica en Instagram y Facebook: Meta es encargado.
    assert.match(page, /Meta Platforms, Inc\./);
    assert.match(page, /guardadas cifradas/);
    // Desde el 2 de octubre de 2026 también lee de Meta las cifras de los reportes: decir que «no se
    // conecta a las cuentas de los clientes» sería falso. Solo agregados, nunca personas.
    assert.doesNotMatch(page, /no se conecta a las cuentas de Facebook o Instagram/);
    assert.match(page, /estadísticas agregadas/);
    assert.match(page, /No descarga la lista de seguidores, mensajes, comentarios ni datos de personas individuales/);
});

test('los términos fijan ley colombiana, rol de Encargado, cláusula de IA y no prometen patentes', async () => {
    const page = await read('src/components/public/TermsOfService.jsx');
    for (const expected of ['República de Colombia', 'Cartagena de Indias', 'Encargado del tratamiento', 'Uso de inteligencia artificial', 'Confidencialidad', 'Versión 2.0']) {
        assert.ok(page.includes(expected), `Falta en los términos: ${expected}`);
    }
    assert.doesNotMatch(page, /patentad/);
});

test('las páginas legales compilan y se enlazan entre sí', async () => {
    for (const file of ['PrivacyPolicy.jsx', 'TermsOfService.jsx', 'AiGovernancePolicy.jsx', 'LegalLayout.jsx']) {
        const path = `src/components/public/${file}`;
        await transformWithEsbuild(await read(path), path, { loader: 'jsx', jsx: 'automatic' });
    }
    const layout = await read('src/components/public/LegalLayout.jsx');
    for (const route of ['/privacidad', '/terminos', '/seguridad']) assert.ok(layout.includes(`to="${route}"`), `El pie no enlaza ${route}`);
    assert.match(layout, /LEGAL_ENTITY\.nit/);
    const security = await read('src/components/public/AiGovernancePolicy.jsx');
    assert.match(security, /15 días hábiles/);
    assert.match(security, /verificación en dos pasos/);
});
