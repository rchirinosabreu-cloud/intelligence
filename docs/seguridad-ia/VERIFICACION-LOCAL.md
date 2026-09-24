# Verificación local de Seguridad y gobierno de IA

## Entrega aislada y prevención de imports faltantes · 24 de septiembre de 2026

Rama `codex/ai-governance-complete`, creada desde `origin/main` (`c6b4644f`) en un worktree independiente. No se editaron fuentes de la carpeta compartida, no se copiaron credenciales y no se desplegó ni activó control para clientes reales.

- Se incluyen juntos el router, servicios, puerta de salida, pantallas privadas, seis documentos, esquema aditivo, `prestart` y pruebas. Se restaura el montaje `/api/ai-governance`; la página pública previamente integrada en `main` se conserva sin cambios.
- Prueba nueva de empaquetado: primero falló por el router ausente; ahora comprueba archivos, modelos, montaje y resolución del grafo completo de imports del servidor mediante esbuild, sin arrancarlo ni consultar servicios externos.
- 122 pruebas focalizadas correctas. Cinco pruebas adicionales con PostgreSQL 17 aislado correctas (DDL idempotente, roles, concurrencia, auditoría atómica, autorización/suspensión y plazo de incidentes). CI ejecuta estas últimas en un servicio separado en el puerto 55449.
- La suite general detectó dos incompatibilidades: faltaban las relaciones de gobierno en el informe de huella del cliente y un aviso no consumía el token destructivo. Se corrigieron con las pruebas existentes primero en rojo. Otras cinco suites requerían el `JWT_SECRET` sintético que ya usa CI; las siete suites afectadas pasaron al repetirlas (50 pruebas).
- Revisión visual del listado y documentos en la muestra aislada, temas claro y oscuro; sin datos reales, correos ni proveedores externos.
- Resultado final: `npm run lint` y `npm run build` correctos; `npm run test:ci` con `JWT_SECRET` sintético: **2147 correctas, 0 fallos y 11 omitidas** (2158 casos). Las suites generales que requieren su propia base no se ejecutaron localmente; CI las provisiona por separado. `npm run prestart` se ejecutó correctamente contra la base sintética de gobierno. `git diff --cached --check` sin errores.

Este empaquetado no amplía la cobertura funcional ni elimina las brechas descritas abajo. La activación exige revisión separada; especialmente, proteger una empresa bloquea los flujos compartidos sin cliente identificado. No hay envío automático de notificaciones de incidentes ni certificación de cumplimiento.

## Registro histórico de la preparación local

23 de septiembre de 2026 · Rama `codex/gobierno-ia` · Sin despliegue

## Ampliación de la puerta de salida · 23 de septiembre de 2026

- **178 pruebas focalizadas correctas, 0 fallos**, con la orden reproducible de abajo. No es la suite completa del repositorio.
- **Compilación correcta**, incluidas 8 pruebas adicionales de JSX. Permanecen advertencias de configuración Prisma heredada, Browserslist, `eval` en una dependencia y tamaño de chunks. No se actualizaron dependencias.
- ESLint de los servicios/rutas/componentes modificados en esta ampliación: sin errores. `git diff --check`: sin errores de espacios.
- PostgreSQL sintético + receptor HTTP real exclusivo de loopback: 0 solicitudes sin alcance, 0 con finalidad incorrecta, 1 con autorización exacta; cambiar a un modelo no autorizado no añade solicitudes. La suspensión del sistema vuelve a denegar.
- Pruebas del adaptador de generación, embeddings, compatibilidad, destino/modelo efectivos, eliminación de metadatos internos y rechazo de destinos desconocidos. DB fallida no permite salida. Prueba técnica de disponibilidad limitada al mensaje fijo.
- Fireflies no pide transcripciones al denegar; calendario no inserta ni modifica invitaciones al bot sin permiso, pero permite quitarlo. Discovery Engine no consulta al denegar. Proveedores simulados, sin comunicaciones reales a clientes.
- Las pruebas existentes de reportes usan dobles explícitos de autorización y transporte; no omiten el control en el código productivo.
- UI local: advertencia explícita sobre impacto en funciones compartidas, sin activar ninguna empresa real. Vista escritorio 1365×900 y móvil 390×844, claro/oscuro. Capturas en `output/gobierno-ia-control-ampliado-*.png` (no versionadas).
- Documentos internos actualizados: inventario de cobertura, límites, manejo de errores, procedimiento de incidentes y riesgo operativo del bloqueo transversal.

```powershell
$env:TEST_DATABASE_URL='postgresql://governance_test@127.0.0.1:55449/governance_test'
node --test tests/aiGovernance.test.js tests/aiGovernanceGate.test.js tests/aiGovernanceRoutes.test.js tests/aiGovernanceUi.test.js tests/aiGovernancePostgres.integration.mjs tests/aiEgress.test.js tests/aiCalendarEgress.test.js tests/aiDiscoveryEgress.test.js tests/googleCalendarWriteReliability.test.js tests/openAIProviderPhaseZero.test.js tests/openAIClientTimeout.test.js tests/briaStrictOutput.test.js tests/reportObservationExtraction.test.js tests/reportPipelineRegression.test.js tests/reportsExtraction.test.js tests/briaContentPlanReview.test.js tests/briaContentPlanReviewPersistence.test.js tests/sharedSelectContract.test.js tests/sharedDatePickerContract.test.js
```

Limitación central: solo las revisiones de parrillas tienen alcance individualizado en este piloto. Los demás flujos inventariados se bloquean preventivamente cuando existe alguna empresa protegida; no se presentan como operativos bajo autorizaciones individuales. Falta verificar staging y todos los procesos reales, gestionar cuentas/bots externos, completar expediente y aprobar activación. PromoGroup permanece en preparación; responsables Rodny Chirinos y Francisco Villa.

## Evidencia de la primera entrega (anterior a la ampliación)

- 59 pruebas focalizadas, 59 correctas, 0 fallos: reglas de gobierno, puerta de autorización, rutas HTTP, estados del listado, PostgreSQL real aislado, revisión/persistencia de parrillas y contratos de selectores/calendarios.
- PostgreSQL de prueba: `127.0.0.1:55449/governance_test`. Datos totalmente sintéticos. El test de integración rechaza cualquier URL distinta a la fijada en el archivo; no carga `.env`.
- DDL ejecutado dos veces para verificar idempotencia; validación de pertenencia/rol activo, rechazo de editor/anónimo, cambios simultáneos, rollback cuando falla auditoría, denegación sin permiso y al suspender sistema, conservación del plazo de incidente.
- Puerta integrada: no consulta memoria ni envía al proveedor sin permiso; revalida cada llamada; interrumpe si se activa el control durante una revisión antes no protegida. IA simulada, sin gasto ni transmisión externa en pruebas.
- Seis documentos: descarga autenticada devuelve 200 y adjunto; acceso sin sesión devuelve 401. Referencias documentales permanecen privadas.
- Prisma `validate`: correcto. No se ejecutó `db push` ni una conexión de prueba contra producción.
- ESLint de archivos de implementación nuevos y servicio de revisión modificado: sin errores. `git diff --check`: sin errores de espacios.
- `npm run build`: correcto; incluye otras 8 pruebas de compilación. Advertencias de dependencias/chunks grandes existentes en el proceso de build; no se actualizaron dependencias.
- Navegador local: creación de borrador y confirmación posterior del servidor, historial, aviso de incidente vencido, selección de día/hora sin cerrar formulario, documentos, escritorio 1365×900 y móvil 390×844, claro y oscuro. Se restauró el viewport al finalizar.

Capturas locales (no versionadas): `output/gobierno-ia-claro.png`, `output/gobierno-ia-formulario-oscuro.png`, `output/gobierno-ia-movil-oscuro.png`, `output/gobierno-ia-documentos.png`.

## Repetir pruebas focalizadas

Con la base sintética local ya iniciada, desde PowerShell en la raíz del proyecto:

```powershell
$env:TEST_DATABASE_URL='postgresql://governance_test@127.0.0.1:55449/governance_test'
node --test tests/aiGovernance.test.js tests/aiGovernanceGate.test.js tests/aiGovernanceRoutes.test.js tests/aiGovernanceUi.test.js tests/aiGovernancePostgres.integration.mjs tests/briaContentPlanReview.test.js tests/briaContentPlanReviewPersistence.test.js tests/sharedSelectContract.test.js tests/sharedDatePickerContract.test.js
```

La base usa los binarios PostgreSQL locales previamente disponibles en `output/quotation-pg-runtime`, un cluster separado en `output/governance-pg-data`, rol `governance_test` y puerto 55449. No reutilizar credenciales o conexiones productivas. La inicialización del cluster no está automatizada por el comando de preview.

Muestra: `npm run preview:gobierno-ia`, puerto 3112, solo loopback. Inyecta exclusivamente una identidad ficticia contra esa base aislada; no montar este servidor de muestra en producción. El servidor real usa autenticación normal y comprobación de rol/pertenencia en PostgreSQL.

## No demostrado todavía

No se ejecutó suite completa de todo el repositorio, prueba en staging, revisión jurídica, verificación de contratos/configuración de proveedores, ejercicio de incidente ni restauración. No se ha demostrado cobertura de todas las salidas de IA. No se cambiaron datos, permisos ni configuración de producción. Los documentos siguen siendo borradores operativos y no deben presentarse como cumplimiento certificado.
