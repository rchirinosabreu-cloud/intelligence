# Terceros, cruces anteriores y períodos — revisión local

Fecha: 9 de noviembre de 2026. Rama: `codex/financial-party-recovery`.
Estado: muestra local aprobada y fusión de código autorizada por Rodny el 9 de noviembre de 2026. Ninguna corrección de datos reales aplicada ni autorizada con esta fusión; el despliegue conserva su aprobación habitual.

## Diagnóstico comprobado en producción (solo lectura)

- **Canjes:** la lista usaba exclusivamente perfiles `ThirdParty` persistidos. El directorio ya mostraba también Clientes y Equipo; Francisco existe en Equipo, pero no tenía ficha financiera. No era un filtro por cuentas abiertas.
- **Grupo Brieva:** dos perfiles financieros. La cuenta por pagar antigua fue anulada por la usuaria y reemplazada por una nueva, vinculada al perfil que sí tiene el cliente. Cartera registra una compensación de $960.000 que ya dejó esa obligación saldada, pero no tiene la aplicación enlazada en Por pagar. No corresponde volver a descontar $960.000 de Cartera. Con una cuenta por pagar de $1.000.000, completar la contrapartida deja $40.000 pendientes.
- **Jesu:** la liquidación pagada de $1.000.000 ya tiene servicio del 16 de septiembre al 15 de octubre. Sigue activo un borrador de septiembre, también de $1.000.000, sin fechas, pagos ni ajustes, que bloquea el período siguiente. Se muestra para precisar o revisar su reversión, nunca se anula automáticamente. El relato posterior menciona 15 de septiembre y el registro original muestra 16: no se cambió esa fecha.
- **Pagos del 16 de octubre:** se identificaron las correcciones de Elisa ($1.000.000) y Jesu ($500.000), de Brain a Francisco. Los dos comprobantes adjuntos muestran cuenta de origen terminada en **0345**, coincidente con Francisco; Brain termina en **3251**. Los cambios actuales concuerdan con los soportes, por lo que no se revierten. Esto no acredita ni descarta una transferencia previa entre las cuentas.

No se alteraron cuentas, movimientos, saldos, liquidaciones, terceros, documentos ni permisos productivos. Los comprobantes consultados se mantienen fuera de los archivos versionados.

## Comportamiento preparado

1. `ThirdParty.roles` permite varias clasificaciones en una misma ficha. Se mantiene `kind` para compatibilidad. Los vínculos explícitos con Cliente y Equipo se editan desde esa ficha; los cruces históricos impiden quitar unilateralmente su vínculo con el cliente.
2. Canjes y cuentas por pagar comparten selección de terceros activos, clientes no archivados y equipo activo. Leer no crea perfiles. Confirmar crea o reutiliza el perfil financiero dentro de la transacción nativa; un fallo revierte también su creación. Un perfil homónimo sin vínculo exige revisar su identidad, no se duplica automáticamente. Un perfil desactivado no se recrea desde el origen.
3. Unificación explícita de dos perfiles financieros: revisión de identidad, documentos, obligaciones y motivo. Conserva las filas originales, pagos y auditoría; mueve únicamente referencias financieras y reúne clasificaciones y vínculos. Los datos bancarios/contacto/documento del destino prevalecen. No fusiona clientes, parrillas ni personas de Equipo por nombre. Documentos o identidades incompatibles bloquean. No admite cadenas de unificaciones.
4. Deshacer una unificación restaura referencias y vínculos originales, con autor y motivo. Se bloquea si hubo cambios posteriores en fichas u obligaciones. Los reintentos no duplican operaciones y la confirmación relee permisos. Los canjes previos conservan el beneficiario original en su evidencia y resuelven su ficha unificada para consultar/revertir; deshacer la unificación también conserva ese recorrido.
5. `Completar cruce anterior` aparece en la compensación histórica de Cartera aunque la obligación ya esté saldada. Revisa la cuenta por pagar de la misma identidad, autorización, motivo, moneda, saldos y períodos abiertos. Crea solo la aplicación faltante de Por pagar, enlazada al pago existente de Cartera. No genera ingreso/egreso. Después se consulta y revierte desde el cruce nativo completo: esa reversión sí restituye ambos saldos, no borra el acuerdo anterior.
6. Nómina identifica los períodos concretos que faltan por precisar antes de abrir otro. Un borrador sin pagos ni ajustes ofrece revisar su reversión; los pagos existentes permanecen intactos. Se reutilizan los formularios y el historial nativos.

## Prueba local

`node scripts/preview-financial-recovery.mjs` abre `http://127.0.0.1:3852` con PostgreSQL local aislado y ejemplos ficticios. Requiere el clúster local de pruebas del proyecto. Reiniciar la muestra crea otro esquema temporal, sin conectarse a la base real.

- Varias clasificaciones: guardar y volver a abrir la ficha.
- Revisar fichas duplicadas: seleccionar origen/destino, revisar, confirmar y deshacer con motivo. Se puede repetir antes de completar el cruce.
- Completar cruce anterior: tras vincular las fichas ficticias, confirmar el arriendo; Cartera conserva $0 y Por pagar queda en $40.000. El detalle nativo permite revisar la reversión del cruce completo.
- Canje con persona del equipo: Francisco figura aunque no tenga pagos anteriores. Se puede revisar/confirmar el canje y luego revertirlo desde el mismo diálogo.
- Revisar períodos de Jesu: el ejemplo señala el borrador adicional; revertirlo libera un nuevo período sin modificar la liquidación pagada.

## Evidencia y límites

- Suite final financiera y de catálogo de 89 pruebas: todas aprobadas, sin omisiones. Incluye canjes, cruces, correcciones, nómina, directorio y recuperación; comprobada también la consulta/reversión de canjes tras unificar y deshacer sus beneficiarios.
- PostgreSQL: conservación de filas, aplicación única, reversión, revisión obsoleta, permiso revocado, concurrencia, fallo de auditoría, período cerrado, perfil inactivo y esquema aditivo idempotente.
- Navegador: componentes reales con servicios nativos sobre datos ficticios; capturas en `output/financial-recovery-*.png`. Incluye unificar/deshacer, desbloquear nómina y completar cruce.
- Compilación de aplicación y análisis de los archivos modificados comprobados. Persisten los avisos generales de tamaño de paquetes de la compilación.
- `ensure-party-roles-schema.js` solo agrega columnas y referencia. Se probó dos veces en esquema temporal; no se ejecutó contra producción. Ningún proceso clasifica ni unifica los legados automáticamente.

La muestra valida estos recorridos; no acredita que los saldos reales ya estén corregidos. La aplicación a Brieva y la resolución del borrador de Jesu quedan para revisión humana en su origen. No se requiere cambiar a Brain los dos pagos cuyos soportes acreditan Francisco.
