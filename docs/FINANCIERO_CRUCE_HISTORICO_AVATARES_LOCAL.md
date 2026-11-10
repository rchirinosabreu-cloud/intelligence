# Cruce histórico y avatares de nómina · 10 de noviembre de 2026

Estado: corrección validada en local; Rodny autorizó fusionar estos ajustes. No se modificaron datos productivos; los siete vínculos pendientes no forman parte de esta fusión.

## «Ver cruce» de Grupo Brieva

La consulta de solo lectura y la reproducción en el navegador confirman el error E-MPHRBV: el detalle recorría todos los eventos como si incluyeran `before.receivable` y `before.payable`. El registro original `SETTLEMENT` solo tiene el saldo de Cartera en `outstanding`; el evento posterior `LEGACY_OFFSET_LINKED` sí incluye ambos lados. Renderizar el primero rompía toda la pantalla, aunque el historial estuviera cerrado.

`offsetHistoryEntry` presenta cada formato sin reescribirlo: compensación en Cartera, vinculación de la contrapartida, cruce nuevo y reversión. No inventa ceros para saldos ausentes. Se conservan eventos desconocidos e incompletos. Los nombres de autores se consultan por sus identificadores existentes; los nombres guardados en el evento tienen prioridad y no se muestran UUID como nombres.

La copia de consulta de Brieva contiene una compensación de $960.000 y el pago de $40.000. Ambos saldos actuales son cero. La revisión de reversión devuelve $960.000 a cada obligación, conservando los $40.000 pagados. No se confirmó ninguna reversión sobre datos reales ni sobre la copia de este caso.

## Fotos en nómina

La tabla agrupada dibujaba siempre iniciales, y el ledger no consultaba las fotos. Ahora usa `TeamAvatar`, con prioridad del vínculo explícito `ThirdParty.teamMemberId`; para contratos sin ese vínculo utiliza el usuario ya asociado al colaborador o al contrato y su miembro de Equipo. Consulta los miembros por ID en un lote y conserva la agrupación financiera existente. No busca identidades por nombres, ni crea vínculos al leer.

Validación local con las fotos reales de Francisco, Francys y Jesús en el componente y AppLayout reales. La muestra incorpora únicamente las fotos de los miembros de su copia privada, a través del mismo endpoint de consulta de avatares. Las personas sin vínculo conservan iniciales. En la consulta productiva faltan vínculos de Equipo/usuario para Brayan Torres, Camila del Toro, David, Keila Daza, Mariceth Peña, Melisa Castaño y Sara Herrera. Resolver esos vínculos es una revisión de identidad aparte, no una asignación automática por nombre.

## Evidencia

- `tests/financialOffsetHistory.test.js`: registro antiguo unilateral, vínculo posterior, reversión, eventos incompletos y saldos ausentes.
- `tests/payrollAvatars.test.js`: proyección por IDs, usuario asociado, agrupación de contratos y homónimos sin vínculo.
- `tests/browser/financialOffsetHistory.mjs`: reproduce primero el error real; después abre el detalle desde Por pagar, muestra ambos eventos y revisa reversión sin confirmar. Usa la exportación privada `output/brieva-offset-detail.json` o `OFFSET_HISTORY_SNAPSHOT`.
- `tests/browser/payrollAvatars.mjs`: carga y decodifica las tres fotos reales, comprueba una fila por persona y que un homónimo sin vínculo no hereda foto.
- Recorrido nativo existente `tests/browser/financialOffsets.mjs`: creación, respuesta perdida y reintento, apertura desde ambas superficies, reversión y diseños claro/oscuro/móvil.
- 39 pruebas de historial, proyección de nómina, búsqueda, identidad y servicios PostgreSQL aislados pasaron; los servicios conservan pagos, auditoría y controles de concurrencia/permisos.

Capturas privadas: `output/payroll-avatars-fixed.png`, `output/brieva-offset-fixed.png` y `output/brieva-offset-reversal-review.png`.

Muestra de nómina: `PERSON_SNAPSHOT_FILE=output/financial-person/snapshot-avatars.json node scripts/preview-financial-person.mjs`, puerto 3866. La variable opcional `OFFSET_HISTORY_SNAPSHOT=output/brieva-offset-detail.json` habilita la consulta del cruce de Brieva en Por pagar; la confirmación de su reversión está bloqueada en esta muestra. No ejecutar scripts de aplicación de identidades productivas para esta corrección. No se necesita migración.

Verificación adicional: ESLint de los archivos de aplicación modificados y compilación `vite build` correctos. La compilación conserva avisos de tamaño de paquetes y de sintaxis CSS ajenos a este cambio; no se cambió el esquema de Prisma.
