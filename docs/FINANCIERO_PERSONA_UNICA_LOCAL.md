# Una ficha por persona: validación local

Solicitud de Rodny, 10 de noviembre de 2026: una ficha en Terceros, Cartera y Nómina, con roles, deudas, contratos y períodos dentro. No fusionar ni modificar datos productivos antes de mostrar el recorrido.

## Resultado

- ThirdParty es la identidad común. FinancialCollaborator y AccountsReceivable pueden vincularse a ella mediante FK restrictiva. Los registros originales, sus ID, contratos, períodos, pagos y comprobantes permanecen.
- Una persona puede tener varias clasificaciones y conservar varios registros históricos de nómina. Los registros vinculados se presentan como una sola persona; no se unen homónimos automáticamente.
- Terceros incluye los registros de nómina y muestra cartera y contratos en la misma ficha. «Relacionar registros de esta persona» revisa la selección y guarda motivo, autor e historial nativo.
- Cartera agrupa por la identidad explícita, conserva el total y desglosa préstamos, canjes y servicios. Cada obligación conserva sus pagos, su moneda y su naturaleza contable. Una devolución de préstamo no se convierte en venta. Los saldos por verificar permanecen excluidos del total confirmado.
- Nómina muestra una fila por persona, con contratos y liquidaciones desplegables. Los botones de aprobación, pago y descuentos operan sobre la liquidación elegida. Las pagadas muestran sus pagos; no repiten el botón de descuentos salvo que tengan descuentos registrados.
- Nuevos contratos y préstamos seleccionan la ficha existente. Editar un contrato vinculado no renombra las identidades históricas de nómina. El total mensual contratado excluye contratos terminados antes del mes seleccionado.
- Generar admite un contrato que cubre exactamente un ciclo mensual completo que cruza meses, sin prorratear. Los tramos incompletos siguen requiriendo un importe revisado. El mes contable no acredita días de servicio. Los períodos desconocidos de otro contrato con vigencia disjunta se conservan en el historial sin bloquear el contrato nuevo; no se rellenan fechas históricas.
- Los descuentos de préstamos consultan la misma identidad y no ofrecen préstamos ya vinculados a otra persona. Cruces y canjes mantienen sus operaciones y reversiones nativas.

## Casos revisados

La copia privada se obtuvo por consultas en transacción READ ONLY. Está en `output/financial-person/snapshot.json`, excluida de Git. El servidor local solo usa PostgreSQL aislado en 127.0.0.1:55448; no lee credenciales productivas.

- **Francisco Villa:** una ficha de Cliente y Colaborador, vinculada al equipo y a nómina. Nueve obligaciones: cuatro préstamos y cinco canjes. Saldo registrado en la copia: $23.909.822; préstamos $17.371.296 y canjes $6.538.526. Conservar los tres canjes de igual importe: tienen orígenes distintos; esta revisión no los declara duplicados ni acredita una conciliación bancaria.
- **Francys Caballero / Francys:** ambos registros históricos quedan vinculados a una ficha. Se conservan el contrato 15 septiembre–14 octubre y el nuevo 26 octubre–25 noviembre. Generar noviembre prepara un borrador de $2.500.000 por el ciclo completo; repetir no crea otro. Se probó guardar contrato con el nombre canónico, aprobar y abrir el formulario de pago; no se confirmó ningún desembolso.
- **Jesús Arnedo:** una sola fila. Conserva el pago de $750.000 por 16–31 octubre contabilizado en noviembre, con su comprobante, y el borrador de $1.500.000 por 1–30 noviembre. Los demás períodos permanecen en el historial.

Comparación por hash antes y después de vincular y recorrer las pantallas: **20 pagos de nómina y 46 comprobantes sin cambios**, además de las aplicaciones de cartera copiadas. Los clientes origen de los canjes se copian con sus aplicaciones para no presentar saldos artificiales. No se copiaron todos los movimientos de la agencia: los indicadores locales pertenecen al alcance de esta muestra, no son un balance general productivo. No se descargaron los archivos bancarios; se conserva su metadata.

## Cómo revisar

Con el clúster de pruebas local y la copia privada disponibles:

```powershell
node scripts/preview-financial-person.mjs
```

Abrir `http://127.0.0.1:3866/financiero?year=2026&month=11&tab=nomina`. Usa AppLayout, FinancialDashboard, formularios, controladores y servicios reales. Solo autenticación y servicios ajenos al financiero se sustituyen en la muestra.

En Terceros, abrir Francisco para ver roles, saldo y contratos. En Cartera, buscar Francisco y abrir su única ficha; el detalle contiene las nueve obligaciones. En Nómina, abrir Francys y Jesu; generar, revisar el período y abrir el historial/pago. Una nueva ejecución del servidor crea otra copia limpia.

`node tests/browser/financialPerson.mjs` recorre una instancia recién iniciada y guarda capturas de escritorio en `output/financial-person/`. Aprueba únicamente el borrador local de Francys y abre el formulario de pago, sin enviarlo. `/preview-api/proof` comprueba que pagos y comprobantes siguen iguales.

## Reversión y controles

«Historial de vínculos» permite deshacer una vinculación con motivo. Solo se retiran los vínculos añadidos y se restauran las clasificaciones anteriores; no se borran personas, obligaciones, pagos, contratos ni auditoría. Una modificación posterior bloquea la reversión para que se revise primero. Las fichas ya unificadas usan su reversión nativa, extendida a los vínculos de cartera y nómina.

Permiso vigente releído, revisión de datos, solicitud idempotente y transacción serializable protegen la vinculación. Un reintento después de una reversión o cambio posterior se rechaza. Los nombres se usan para buscar, nunca para confirmar identidad.

Esquema aditivo: `scripts/ensure-financial-person-schema.js`, incluido en el arranque después de Terceros. Se probó en esquemas locales, dos ejecuciones consecutivas, conservando pagos/comprobantes. No se ejecutó en producción ni se autorizó con este trabajo la actualización de fichas productivas.

## Evidencia

Validación final del 10 de noviembre: **320 pruebas financieras aprobadas, ninguna fallida ni omitida**; recorrido de navegador de los tres casos aprobado, seis capturas y comparación de pagos/comprobantes sin cambios. Lint y compilación aprobados. La prueba de compatibilidad comprueba que una unificación anterior al esquema sigue siendo reversible si no hay cambios posteriores; añadir vínculos nuevos bloquea su reversión.

- `tests/financialPerson.test.js`: agrupación por identidad, homónimos, tipos de deuda y períodos.
- `tests/financialPersonPostgres.test.js`: vinculación, reversión, concurrencia, permisos, conservación de pagos, selector único, edición de alias, generación del ciclo y esquema aditivo.
- `tests/browser/financialPerson.mjs`: recorrido de los tres casos en componentes reales y comprobación de conservación.
- Regresión financiera, pruebas de períodos, cruces y canjes, lint, build y auditoría de código muerto ejecutados localmente. Logs y capturas en `output/financial-person/`.

Rodny aprobó la muestra y autorizó fusionar junto con las correcciones de datos revisadas. Alcance productivo: vincular las identidades de Francisco, Francys y Jesu, conservar sus roles y relaciones con Equipo y reunir los cuatro préstamos de Francisco en su ficha existente. Conservar pagos, importes, contratos, períodos y auditoría. La aprobación del borrador local de Francys fue una prueba y no se traslada a producción; cualquier generación utiliza su operación nativa. Aplicación de vínculos después de verificar despliegue/esquema, releyendo los registros y dejando un recibo privado. La fusión por sí sola no modifica estos vínculos.
