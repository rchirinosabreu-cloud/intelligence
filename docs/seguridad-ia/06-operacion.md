# Guía privada de operación y puesta en producción

Versión 0.1 · 23 de septiembre de 2026 · INTERNO

Responsable del programa y de su coordinación operativa: **Rodny Chirinos**. Suplente: **Francisco Villa**, para todos los clientes y el piloto de PromoGroup. En registros nuevos del programa, asociar al responsable mediante su cuenta vigente verificada en Equipo; no codificar nombres como permisos ni inventar identificadores. Conservar responsables y actores históricos. Esta actualización documental no reasigna registros existentes ni cambia accesos del sistema.

## Acceso y uso

Ruta de aplicación: `/gobierno-ia`. Solo administradores activos con pertenencia activa al equipo acceden a registros y documentos. La API verifica la sesión y vuelve a comprobar la pertenencia; ocultar un menú no es el control de acceso. No hay ruta pública para expedientes.

1. **Sistemas de IA:** registrar producto/proveedor/modelo, finalidad, responsable y condiciones verificadas. Guardar borrador hasta contar con región, retención, entrenamiento, subencargados y contrato/evaluación. Aprobar exige esos campos, pero una persona debe verificar su contenido.
2. **Riesgos:** seleccionar cliente y sistema, documentar el conjunto de escenarios, controles y valoración. Mitigado requiere evidencia y evaluación residual. Usar el mayor residual de los escenarios aplicables.
3. **Autorizaciones:** seleccionar cliente/sistema/evaluación. Caso inicial `parrillas.review`; proveedor `openai`; modelo exactamente igual al modelo rápido desplegado. El flujo trata la carga como CONFIDENTIAL, sin inspección automática: excluir datos restringidos y minimizar datos antes de usarlo. Registrar aviso real, permiso escrito, responsable y vigencia. No inventar comunicaciones para superar el formulario.
4. **Control por empresa:** activar expresamente, con motivo y referencia de aprobación interna. Sin autorización válida, las nuevas llamadas de revisión se deniegan. Antes de cada lote y verificación se revalida. Mientras exista una empresa protegida, las salidas IA sin alcance seguro quedan bloqueadas preventivamente, incluidas funciones compartidas de otros clientes. No es un interruptor global. Desactivar la última empresa protegida elimina también ese bloqueo preventivo: es una acción administrativa auditable de alto impacto, no una revocación del permiso contractual. Nunca desactivar para eludir una denegación.
5. **Incidentes:** registrar al conocerlo, comunicar por el correo acordado sin esperar investigación completa y añadir evidencia. Avanzar a contenido/recuperado/cerrado documentando cada fase. El listado se actualiza periódicamente mientras está abierto; no hay alertas fuera de la pantalla ni correo automático en esta versión.
6. **Historial:** consultar actor, motivo, fecha y antes/después. Cambios se guardan en transacción con el evento. No hay borrado por API; un administrador de base de datos conserva capacidad técnica de alteración. Pendiente almacenamiento resistente a manipulación.
7. **Documentos internos:** al seleccionar un título, su contenido se despliega dentro del módulo, con encabezados, listas y tablas. Solo hay una lectura abierta a la vez; se puede cerrar o cambiar de documento. «Descargar Markdown» conserva la descarga autenticada como opción secundaria. Ambas acciones usan la misma API privada y no publican enlaces. Personalizar y aprobar antes de entregarlos como política vigente. El repositorio privado también debe mantenerse restringido.

Ediciones simultáneas: si aparece «el registro cambió», cerrar, recargar y revisar la versión vigente antes de volver a editar. No reintentar automáticamente sobrescribiendo una aprobación. Cambiar sistema/riesgo invalida autorizaciones vinculadas a su versión anterior.

## Límites de esta entrega

- No certifica cumplimiento ni verifica firmas, acuses, representación o autenticidad de evidencia.
- No ejecuta DLP, anonimización automática, antivirus, SIEM ni control de herramientas personales.
- Los flujos sin cliente/finalidad seguros quedan suspendidos, no habilitados por una autorización de parrillas. Individualizar minutas, memoria, reportes, aprendizajes, chat y funciones internas es el siguiente desarrollo para reducir el impacto transversal.
- No es un cortafuegos de red. No controla herramientas personales, scripts externos, ingestión del proveedor, otros bots ni datos ya enviados. El almacenamiento de archivos y la sincronización no IA conservan sus controles existentes.
- No sustituye consentimiento/base jurídica de titulares ni aprobación jurídica/contractual.
- No manda avisos ni alerta al suplente. No garantiza atención 24/7 ni continuidad.
- Evidencias son referencias privadas; almacenamiento de archivos, retención automática, aprobación por dos personas y exportación consolidada del expediente pendientes.
- La validación ocurre antes de la llamada; no puede retirar datos ya transmitidos. Existe la ventana normal entre validación y envío; suspensión urgente exige coordinación técnica del proceso y proveedor.

## Puerta de salida y tratamiento de errores

`aiEgress.js` identifica proveedor y modelo del destino/cuerpo efectivos; descarta los metadatos internos antes de transmitir y rechaza redirecciones. Cada solicitud consulta la política vigente sin caché de permisos. Un fallo de base de datos o auditoría impide enviar. La disponibilidad de IA depende ahora de esas tablas, incluso con controles sin activar: verificar creación del esquema antes de iniciar cualquier proceso que use el adaptador.

`AI_SCOPE_REQUIRED` indica un flujo sin alcance seguro; `AI_AUTHORIZATION_REQUIRED`, falta de autorización exacta. Los proxies conservan HTTP 403 y el motivo. Algunos módulos históricos todavía muestran un error genérico o generan una alternativa local; no significa que se haya usado IA. La comunicación homogénea de estos errores en todas las pantallas queda pendiente.

La comprobación técnica de OpenAI es la única excepción deliberada: un mensaje fijo de disponibilidad sin datos del cliente ni entrada del usuario. La categoría CONFIDENTIAL es una etiqueta conservadora, no una detección automática; siguen prohibidos los insumos fuera del alcance autorizado.

## Despliegue seguro propuesto

No desplegar esta rama mientras otra persona/Claude esté modificando el checkout sin coordinar. Revisar diff y separar cambios ajenos. Probar en staging y obtener aprobación de activación.

DDL aditivo: `scripts/ensure-ai-governance-schema.js`, seis tablas nuevas y relaciones restrictivas; no elimina/renombra datos existentes, no cambia PostgreSQL ni Task/CORS. El arranque debe ejecutar este script antes de servir la integración. No usar `prisma db push --accept-data-loss`. El esquema Prisma refleja las tablas para evitar que un futuro db push las considere ajenas.

Antes del despliegue: respaldo verificable; confirmar rol con permisos para DDL, capacidad y ventana de cambios; ejecutar pruebas de esquema en staging con copia anonimizada; validar inicio, autenticación, permisos, aprobación, rechazo, revocación, cambios de modelo, incidente y recuperación. El test PostgreSQL local solo utiliza su base sintética exacta, sin cargar `.env`.

Cliente piloto seleccionado por Rodny: **PromoGroup**, en preparación y no activado. Requisitos y alcance en `01-programa.md`, sección «Piloto seleccionado: PromoGroup». La selección no acredita autorización del cliente ni implica que el brief de la licitación sea su contrato.

Activar el cliente piloto después de completar expediente y aprobar expresamente la activación. Confirmar con una solicitud sintética que sin permiso no sale ninguna llamada al proveedor y que con permiso exacto sí pasa. Probar todos los modos de ejecución de revisión (manual, programada y verificación). Vigilar errores y dejar alternativas manuales.

Rollback: detener el nuevo despliegue y volver a una versión conocida si es necesario, conservando tablas/evidencias. Advertencia: la versión antigua no contiene este bloqueo. Antes de volver, suspender el tratamiento de IA de los contratos protegidos mediante controles operativos o técnicos equivalentes. Nunca desactivar control solo para «hacer pasar» un trabajo sin permiso.

## Evidencia de aceptación a completar

Versión/commit [ ]; responsable **Rodny Chirinos**; suplente **Francisco Villa**; fecha [ ]; resultados de pruebas [ ]; capturas claro/oscuro/móvil [ ]; prueba de base aislada [ ]; prueba staging [ ]; aprobación de Dirección [ ]; primer cliente activado [ ]; contactos y disponibilidad de respuesta a incidentes [ ]; acta de simulacro [ ]. Una prueba local no demuestra configuración ni funcionamiento en producción.
