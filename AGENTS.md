# Contexto Maestro para Agentes IA (Brain Studio)

Este archivo contiene las reglas y el contexto inmutable del proyecto para evitar regresiones o pérdida de contexto en futuras interacciones. **DEBE SER LEÍDO Y RESPETADO ANTES DE CUALQUIER CAMBIO.**

## 1. Base de Datos (Prisma)
- **Proveedor:** El proyecto utiliza `postgresql` en producción (Railway). **NUNCA** cambies el provider a `sqlite` ni a ningún otro en `prisma/schema.prisma`.
- **Sincronización:** No se utilizan archivos de migración locales (carpeta `prisma/migrations`). Las actualizaciones de esquema se aplican directamente con `npx prisma db push` o scripts de post-instalación en producción.
- **Modelo `Task`:** Debe contener siempre la columna `completedAt DateTime?` para evitar pérdida de datos en el historial.

## 2. Configuración de Red (CORS)
- **CORS en Backend:** El backend (`server.js`) implementa un `corsOptions` dinámico con validación mediante regex y una lista blanca de orígenes.
- **Importante:** **NUNCA** elimines ni alteres la configuración de orígenes permitidos (especialmente las regex que permiten los despliegues generados en Vercel/Railway) porque rompería el frontend de producción (`corsError`).

## 3. UI y Estilos (Soporte Dual: Light / Dark Mode)
- **Obligatorio:** Todos los componentes, modales y tarjetas deben soportar ambos temas usando las utilidades de Tailwind (ej. `bg-white dark:bg-slate-900` y `text-slate-900 dark:text-slate-50`).
- **Prohibido:** NUNCA usar colores estáticos o fijos (`bg-white` sin su contraparte `dark:`, o `bg-black`) que rompan la legibilidad si el usuario cambia de tema.
- **Identidad de Marca:** Respetar los acentos en tonos morados/violetas corporativos (ej. botones principales).
- **Color destructivo global:** `#E11D48` es el único color para acciones de eliminación y alertas en toda la plataforma. Debe consumirse mediante los tokens semánticos de Tailwind (`text-destructive`, `bg-destructive`, `border-destructive`, sus variantes de opacidad) o los componentes compartidos; nunca mediante utilidades `red-*`/`rose-*` ni hexadecimales locales. Los estados hover, focus, bordes, iconos, mensajes y superficies suaves deben derivar del mismo token y conservar contraste AA en light/dark mode.
- **Superficies de IA y Bria:** Todas las superficies destacadas relacionadas con IA, Bria o su mascota (banners, encabezados de paneles, novedades y popups) deben usar el degradado turquesa/verde/cian aprobado, conservar texto blanco de alto contraste e integrar la mascota. **Nunca usar banners negros** ni fondos negros para estas experiencias. Los cuerpos de modales y tarjetas siguen siendo neutros y compatibles con light/dark mode.

## 4. Componentes y UI Elements
- **Desplegables globales (actuales y futuros):** Toda selección simple debe usar `src/components/ui/Select.jsx`, nunca un `<select>` directo en un módulo. En escritorio abre la lista accesible de Brainstudio; en móvil/táctil (`hover: none` y `pointer: coarse`) conserva el selector nativo del sistema operativo. No decidirlo solo por el ancho de pantalla ni sustituir el control móvil por el de escritorio.
- **Menús y listas de opciones:** Las acciones usan `ui/dropdown-menu.jsx`; las listas especializadas (menciones, sugerencias, emojis, prioridad) comparten `brain-popover-surface`, fondo neutro light/dark, borde fino y sombra suave. No crear skins locales. Acordeones de contenido y calendarios no son selectores de opciones y conservan su semántica. Selección múltiple requiere su propio control accesible; no simularla con selección simple.
- **Estabilidad y accesibilidad de desplegables:** Conservar apertura, foco y elección durante polling/refetch; claves por identidad, nunca por posición. Teclado, Escape, foco de retorno, viewport, opciones deshabilitadas, `required`, formularios y payloads deben seguir funcionando. No enviar una opción eliminada/deshabilitada durante la apertura. Cada campo debe tener etiqueta accesible. Contrato preventivo: `tests/sharedSelectContract.test.js`; verificación real local: `tests/browser/selects.mjs`. Alcance: `docs/DROPDOWN_CONTROLS.md`.
- **Popovers:** Usar la superficie compartida `brain-popover-surface`: fondo neutro light/dark, borde fino, sombra suave, títulos en caja normal y peso semibold. Evitar sombras grandes, flechas decorativas y tarjetas anidadas. Limitar ancho/alto al viewport; las fechas deben tener fallback legible y respetar America/Bogota.
- **Boring Avatars:** Se utiliza la librería `boring-avatars` para los avatares en toda la aplicación (Dashboard, CampfireWidget, Tasks). Siempre respeta su importación y uso en los componentes en lugar de depender exclusivamente de imágenes estáticas, a menos que se especifique lo contrario.
- **React Datepicker:** (Si se especifica o está instalado) Debe integrarse correctamente y utilizar los estilos oscuros (`react-datepicker/dist/react-datepicker.css`), asegurándose de no romper la estética general del formulario en modals (e.g., bordes redondos, fondos transparentes, hover oscuro).

## Herramientas de agentes y documentación
- Las skills compartidas del repositorio viven únicamente en `.agents/skills`; conservar `skills-lock.json` y revisar cambios antes de actualizar. No versionar adaptadores/enlaces generados para otros asistentes. Las preferencias personales se instalan a nivel de usuario. Política y catálogo: `docs/AGENT_SKILLS.md`.
- Tono de Brainstudio: **Estratégico, Analítico y Propositivo** (preservado del antiguo `.agent/skills/agency-tone.md`).
- Las skills de desarrollo no son la memoria de Bria ni se cargan automáticamente en producción. Su comportamiento operativo se implementa y evalúa en los servicios de la aplicación.

## 5. Integridad de Estados (Task Lifecycle)
- **Regla Estricta de Completitud:** El campo `completedAt` de una `Task` está estrictamente acoplado a su `status`.
  - Si `status` cambia a `'Realizado'`, el backend DEBE inyectar automáticamente `completedAt: new Date()` (solo si no tenía una fecha previa para evitar sobrescribir el historial al editar otros campos).
  - Si `status` cambia a cualquier otro valor (ej. `'Pendiente'`, `'En proceso'`), el backend DEBE forzar `completedAt: null`.
  - El frontend NUNCA debe enviar `completedAt` directamente; es responsabilidad exclusiva del controlador del backend (`nativeTaskService.js`) manejar esta lógica de transición.

---
*Nota para el agente: Si estás a punto de modificar `schema.prisma`, `server.js` (sección CORS), o archivos clave de UI, revisa primero estas reglas.*

## bitácora de Reflexión Visual (Responsive Audit)

### 1. Auditoría de Capas (Z-Index)
- **Sidebar Móvil:** `z-[60]` (Prioridad absoluta para navegación táctil).
- **Overlay:** `z-55` (Bloqueo de interacción con el contenido).
- **Header Fixed:** `z-50` (Permanece accesible en desktop, queda detrás del sidebar en móvil).

### 2. Control de Márgenes (pt-20)
- El contenedor `<main>` implementa `pt-20` forzoso. Esto garantiza que el saludo del usuario ("¡Hola, Rodny!") no quede asfixiado debajo del header de `h-16`. Los tests de Playwright validan un offset real de `80px`.

### 3. Notificaciones Centralizadas
- Se eliminó la campana del Dashboard para evitar redundancia y fatiga cognitiva.
- La lógica de notificaciones (unread count, status fetching, background polling) se migró al componente `AppLayout.jsx`, reactivando la funcionalidad real en el Header.

## 6. Reglas de Desarrollo y Testing (TDD Estratégico)

1. **Backend y Lógica Crítica (TDD Obligatorio):** Para cualquier nueva ruta de API, integraciones con terceros (OpenAI, Fireflies), parseo de datos (JSON) o lógica de autenticación/base de datos, **DEBES utilizar un enfoque TDD**. Escribe primero las pruebas (usando Jest o la herramienta configurada), asegúrate de que fallen, y luego escribe el código para que pasen.

2. **Manejo de Respuestas de IA:** Todas las funciones que procesen respuestas de LLMs (OpenAI, Gemini) deben incluir una prueba específica que simule la recepción del string envuelto en bloques de código markdown (ej. \`\`\`json ... \`\`\`) para garantizar que el sistema lo limpie y parsee correctamente sin lanzar `SyntaxError`.

3. **Test-Driven Development (TDD) Obligatorio en Frontend:** El enfoque TDD ya no es exclusivo del backend. Todo componente nuevo, lógica de estado o refactorización visual profunda debe tener sus pruebas escritas (ej. React Testing Library / Jest) ANTES de la implementación. Las pruebas deben pasar antes de considerar el código listo.

4. **Verificación Visual Obligatoria (Screenshots):** NUNCA des por terminada una tarea de Frontend sin antes renderizarla. Por cada cambio visual, de layout o de componentes en el frontend, DEBES proporcionar obligatoriamente una captura de pantalla (screenshot) de la interfaz final para que el usuario valide que el diseño no se rompió en resoluciones estándar.

5.  **Regla de Oro de Consistencia Visual:** Prohibido introducir estilos visuales nuevos (bordes de colores, sombras excesivas o jerarquías de títulos diferentes) sin aprobación. Toda la app debe seguir el diseño limpio y neutro de la Fase 1.

---

Reglas Estrictas de Desarrollo y Prevención de Errores (Core Guidelines)
1. La Regla de la Verdad (Server-First Notifications):

NUNCA dispares una notificación de éxito en el Frontend (toast.success, alertas, etc.) basada únicamente en el clic de un botón.

Las notificaciones de éxito y los cambios visuales en el UI (cerrar modales, mover tarjetas) SOLO deben ejecutarse dentro del bloque then (o después del await) una vez que el Backend (API/Base de datos) haya respondido con un status 200 OK o 201 Created.

Si la base de datos falla, el usuario debe ver un error claro, no un falso éxito.

2. Blindaje de Enums y Payloads:

Al enviar datos que usan Enums de Prisma (ej. estados, roles), el Frontend debe enviar el valor EXACTAMENTE como está en el esquema (usualmente en MAYÚSCULAS).

Antes de enviar un PATCH o POST, siempre verifica que el objeto payload contenga los campos requeridos para la acción que se está ejecutando. No recicles payloads de otras funciones sin revisarlos.

3. La Cláusula "Anti Copy-Paste":

Al duplicar un componente de UI (ej. copiar el Modal de "Devolver" para crear el de "Reintegrar"), es OBLIGATORIO revisar y renombrar:

La función que se dispara en el onClick.

El Endpoint de la API al que apunta.

El mensaje de la notificación.

Prohibido dejar "cables cruzados" entre componentes distintos.

4. Migraciones de Base de Datos Seguras (Prisma):

Antes de hacer un npx prisma db push o modificar un esquema existente (especialmente si cambias nombres de Enums o eliminas columnas), debes evaluar si hay datos existentes que se puedan romper o perder.

Si un cambio puede afectar datos antiguos, debes proponer un script de migración o una estrategia para actualizar los registros huérfanos antes de hacer el despliegue a producción.

5. Logs de Error Obligatorios:

Todo bloque catch en llamadas a la API debe hacer un console.error del mensaje real que devuelve el servidor (error.response?.data), no solo un texto genérico. Esto nos permite debugear fallos de Railway o Prisma en segundos.

## 7. Integridad de las revisiones de Bria

- La lectura, la huella y la validación antes de publicar deben representar exactamente las mismas piezas activas (`deletedAt: null`). Nunca comparar la revisión visible con piezas eliminadas: provoca reinicios infinitos.
- Marcar un hallazgo como corregido y programar su verificación son una sola transacción. Deshacer una corrección pendiente invalida cualquier resultado en ejecución. Un fallo de persistencia nunca debe dejar una corrección falsamente confirmada.
- La desaparición de un hallazgo de la siguiente respuesta de IA no demuestra que se resolvió. Cerrar requiere una verificación explícita de ese hallazgo contra la versión actual y evidencia validada. Ante omisión, contradicción o evidencia insuficiente, conservarlo abierto y explicar el resultado; nunca inventar éxito.
- Los motivos de descarte pertenecen al historial de ese cliente/parrilla. No convertirlos automáticamente en reglas permanentes de memoria sin un flujo de aprobación.
- Cobertura de piezas y dimensiones evaluables son métricas distintas. No presentar un porcentaje de dimensiones como si representara todas las piezas revisadas. No recortar piezas/textos silenciosamente; publicar puntaje solo cuando estén completos todos los lotes de la misma versión. Los avances parciales deben persistirse con propiedad del trabajo, invalidarse al editar y nunca exponerse como resultados finales. Las revisiones antiguas sin alcance registrado no adquieren cobertura por inferencia.
- La validación editorial de criterios corresponde principalmente al responsable de la parrilla; project managers y admins también pueden validar. No restringir el flujo a personas concretas. Registrar validador, cliente/parrilla, criterio y versión; una aprobación para un cliente no se aplica globalmente a otros.
- Cambios de rúbrica/modelo requieren evaluación comparativa antes de promoción. Los casos sintéticos y las pruebas con respuestas simuladas no equivalen a criterios aprobados por el equipo. Mantener candidatas separadas del criterio productivo, registrar versión/huella y no transformar descuentos sin defecto asociado en un puntaje artificialmente perfecto.
- Los criterios editoriales se guardan en `ClientEditorialCriterion`, separados de descartes y documentos históricos. Solo `APPROVED` entra a las revisiones de su cliente; aprobar/revocar exige motivo, versión esperada e historial con actor. El responsable se resuelve por `ContentPlan.owner.userId`, nunca comparando IDs de `TeamMember` con IDs de `User`. Revocar no elimina el historial. Validar desde otra parrilla no concede permisos sobre la de origen.
- Al crear un criterio manual, solo categoría y criterio son obligatorios: el contexto es opcional, plegado bajo «Añadir contexto». Su ausencia se guarda vacía, nunca como una justificación inventada; autor, fecha y versión siguen registrados. Ajustar un borrador y aprobar/rechazar/revocar mantienen motivo obligatorio. Las propuestas de IA conservan razón y fuentes obligatorias; esta simplificación no debilita su validación.
- Aprobar o revocar criterios invalida las revisiones en curso del cliente. Las parrillas activas se encolan; las finalizadas sin verificación solicitada quedan `STALE`, no en una espera automática infinita. El hash de publicación incluye los criterios aprobados y sus versiones.
- Solo un admin activo con acceso a parrillas puede eliminar definitivamente un criterio, en cualquier estado. Exigir confirmación `ELIMINAR`, versión vigente y cliente coincidente en backend. Se elimina el registro y su historial; no las revisiones antiguas. Si estaba aprobado, invalidar/encolar revisiones en la misma transacción y orden de bloqueos que aprobar/revocar. Revocar sigue siendo la alternativa que conserva historial.
- En criterios de Bria, «Proponer criterio» va debajo del texto introductorio. Las acciones visibles son textos sin relleno ni borde: aprobar en turquesa, rechazar neutro y «Ver detalle» para consultar fuentes e historial (este último secundario y plegable). Ajustar/revocar/eliminar van en «⋯» arriba a la derecha, según permisos. Revocar/eliminar conservan el token destructivo global, nunca aprobar/rechazar. Mantener área táctil mínima de 44 px y contraste AA también al enfocar el menú en oscuro; `brain-destructive-text` deriva el rojo accesible del mismo token, sin otro rojo local.
- El cálculo `traceable` es candidato de evaluación, no el predeterminado productivo. Exige chequeos explícitos por pieza/regla y citas existentes; las limitaciones de cobertura se muestran aparte. Un descuento explicable no garantiza que el juicio editorial sea correcto. El formato estricto y el razonamiento adicional son opt-in y no alteran los usos existentes del proveedor.
- En diálogos nuevos de Bria, `brain-ai-header` centraliza el degradado verde/cian con contraste para texto blanco. Mantener mascota pequeña sobre blanco, cuerpos neutros, controles táctiles y la etiqueta de candidato en previsualizaciones experimentales.
- Los aprendizajes automáticos son **propuestas**, nunca aprobaciones: fuentes de feedback y notas internas conservan su procedencia diferenciada. Una nota interna no es una orden del cliente; una pieza aprobada no prueba una regla. No usar feedback de desempeño, notas personales ni información financiera como memoria editorial.
- `ClientEditorialCriterion.scope` distingue `CLIENT` de `PLAN`; el segundo solo se aplica a `sourcePlanId`, también al comprobar el hash antes de publicar una revisión. Solo se ajustan borradores `PROPOSED`, con permisos de origen, versión esperada, motivo e historial; el texto aprobado no se cambia silenciosamente.
- `ClientCriterionDiscovery` coordina búsquedas explícitas por cliente con lease, checkpoints y huella de fuentes. No publicar lotes parciales ni resultados sobre fuentes/criterios cambiados. Conservar solo huellas de evidencia para evitar recrear propuestas eliminadas a partir de las mismas fuentes; no conservar su texto/historial fuera del criterio. El barrido periódico no está habilitado por este primer bloque.

## 8. Integridad financiera

- Ruta y estado: `docs/FINANCIAL_ROADMAP.md`. Nómina quincenal (15 y último día) queda pendiente de implementación; no presentar la generación mensual actual como solución de ese requisito.
- Un ingreso y una aplicación a cartera son hechos vinculados, no dos ingresos. Al aplicar un movimiento existente conservar cliente, cuenta, fecha, concepto e importe; no crear dinero adicional. Pagos nuevos requieren concepto explícito. Mantener requestId estable en reintentos y verificar huella/actor en backend.
- Una promesa de pago no disminuye saldo. Mostrar saldo después de aplicaciones, no monto original, y no llamar mora a deuda sin vencimiento. Identificar el alcance anual/histórico: no presentar un subconjunto como toda la cartera.
- Cobros y obligaciones usan centavos seguros y montos positivos: no liquidar poniendo el monto en cero. Un PAGADO histórico sin abonos suficientes es un saldo por verificar, no una deuda nueva ni prueba de cobro; bloquear cambios incompatibles sin inventar pagos ni reabrirlo por editar notas.
- Incluir importación activa y entradas posteriores de plataforma (MANUAL/SYSTEM) en las vistas relacionadas. Usar `invalidateFinancialQueries` después de confirmar escrituras. Error de lectura no significa «todo al día»; no recortar listas silenciosamente.
- Movimientos vinculados a pagos, nómina o conciliación aprobada no se editan/anulan mediante CRUD genérico. Reimportaciones no pueden borrar esas relaciones. Reversiones futuras deben conservar evidencia y corregir todos los efectos en una transacción.
- Revalidar conciliación contra datos vigentes, cuenta/moneda/periodo y estado; nunca aprobar una propuesta obsoleta ni inventar saldo cero ante extracción incompleta. Saldo inicial de cuenta tiene un día de corte explícito.
- Acceso a Financiero: solo `User.role === ADMIN` o casilla `modulePermissions.financiero === true` habilitada por un admin en Equipo. Nombres de cuenta, `hasFinancialAccess` antiguo o un nivel financiero sin casilla no conceden entrada. Desmarcar revoca acceso. Los niveles VIEWER/EDITOR/APPROVER limitan acciones dentro del módulo; una casilla histórica habilitada con nivel NONE/ausente conserva EDITOR, sin conceder aprobación. Compartir `hasFinancialPermission` entre API/UI y comprobar permisos vigentes y usuario activo en backend. No reasignar permisos productivos automáticamente.
- Pruebas reales de finanzas solo contra `TEST_DATABASE_URL` aislada y validada. Nunca usar la conexión productiva de `.env` para pruebas, seed o limpieza. No confundir pruebas con dobles de persistencia con verificación real de concurrencia.

## 9. Propuestas y cotizaciones

- Estado y despliegue: `docs/QUOTATION_PROPOSALS.md`. `proposal_details` es un snapshot opcional/versionado y requiere la columna nullable en PostgreSQL antes de publicar el backend; la muestra local no equivale a persistencia real.
- Servicios personalizados no crean catálogo ni costos ficticios. Ejecución por servicio/etapa es independiente de mensualidades de cobro. Grupos son complementarios; escenarios, alternativas.
- Cuotas suman exactamente el total contractual con descuentos e impuestos configurados; distribuir redondeo en centavos y no registrar dinero ni cartera por definir un calendario de pagos. No confundir cuotas con recurrencia de servicios.
- HTML permitido y enlaces HTTP(S) se validan en servidor y se conservan en web/PDF. No publicar scripts, imágenes o estilos arbitrarios; no truncar silenciosamente texto enriquecido.
- El plan de pagos sustituye solo la cláusula genérica conocida del anticipo. Preservar acuerdos personalizados y requerir confirmación de compatibilidad al emitir. Propuestas aprobadas son inmutables; proteger versión tanto al guardar como al aceptar.

## 10. Destino y reciprocidad de Google Calendar

- Al crear un evento o generar Meet desde Actividad, la cuenta enviada debe coincidir con la selección visible. Mantener opción vacía explícita, orden estable y elección durante las actualizaciones de conexiones; bloquear creación sin cuenta activa. El backend de creación nunca sustituye una selección vacía o inválida por Coordinador ni por otra cuenta.
- El selector de creación significa el calendario principal de la cuenta elegida, independientemente del tipo de evento. Verificar identidad OAuth, calendario principal y permiso de escritura antes de persistir la intención. Una configuración histórica que apunte a otro calendario debe producir un error explícito, no una reparación silenciosa. Un fallo temporal de Google no desactiva credenciales; una identidad incompatible exige reconectar solo esa conexión.
- Conservar el par conexión/calendario persistido y la identidad de solicitud al reintentar. Los eventos existentes no cambian de organizador mediante una edición normal: mostrar el origen bloqueado y rechazar cambios de cuenta/calendario en backend. Un traslado futuro requiere un flujo específico con verificación; nunca ignorar el PATCH ni duplicar el evento.
- No inventar Coordinador como organizador cuando Google no lo devuelve. Las pruebas deben cubrir apertura antes de cargar cuentas, actualización de conexiones y creación para ambos destinos. Dobles de Google y persistencia no certifican entrega real; diferenciar comprobaciones locales de validación productiva. Informe: `docs/CALENDAR_ACCOUNT_ROUTING_AUDIT_2026-09-08.md`.

## 11. Integridad de adjuntos de comentarios

- Vista previa y descarga (incluida la del visor) deben conservar la identidad del mismo adjunto: `attachmentId`, comprobando tarea y comentario en backend. Un nombre visible no es una identidad. Nunca resolver varios archivos con `findFirst({ commentId })` ni elegir la primera/última URL del texto.
- Los adjuntos históricos se seleccionan por una URL que ya figure en ese comentario; nunca aceptar una clave libre del almacenamiento. Sin selector, solo servir un archivo inequívoco; ante ambigüedad o selección inválida, devolver un error sin sustituirlo por otro.
- En una tarea existente, texto y archivos seleccionados se envían juntos al pulsar Enviar. Guardar comentario y relaciones en una transacción; limpiar el borrador solo después del éxito confirmado y conservarlo ante error. Límites compartidos: 10 archivos, 25 MB totales por mensaje. Las cargas utilizan claves únicas, incluso con nombres iguales o subidas simultáneas.
- Verificación y límites de alcance: `docs/TASK_COMMENT_ATTACHMENTS.md`. Los dobles de base de datos/almacenamiento y las capturas locales no certifican el estado de archivos históricos de producción.

## 12. Reconocimientos del equipo

- Catálogo y estado: `docs/RECOGNITION_ANIMATIONS.md`. Conservar únicamente los seis reconocimientos seleccionados y sus textos; no reintroducir propuestas descartadas ni «Bria celebra contigo».
- «On fire» significa ocho tareas distintas en el día; «Ya son 50» significa 50 en la misma semana, no un acumulado histórico. Usar calendario de Bogotá y evitar premios duplicados por reabrir/completar.
- Conservar el widget «Logros recientes» y el «Historial de logros» original: tareas, cliente, hora, agrupación por miembro, búsqueda, fecha y reapertura según permisos. Añadir títulos cortos de reconocimiento como metadatos, nunca reemplazar las tareas por una lista de premios. Solo asociar una etiqueta por identidad explícita de tarea y usuario; no inventar una tarea para una aprobación de parrilla.
- En «Buen comienzo», «Cada avance cuenta» empieza en una línea nueva. El mensaje de parrilla es «El cliente aprobó tu parrilla, mandemos a producción»; el aviso no despacha tareas automáticamente.
- El motor real vive en `recognitionService.js`: otorgamiento y transición comparten transacción serializable, bloqueo previo a lecturas y claves únicas. `RecognitionTaskState` conserva la primera finalización aunque se reabra/elimine la tarea. Cambios de asignación, eliminación o aplazamiento no deben fabricar «Al día» ni entregas anticipadas.
- El arranque usa `ensure-recognitions-schema.js` aditivo e idempotente: preservar `completedAt` y ciclos históricos; sembrar evidencia, nunca premios retroactivos. No sustituirlo por un `db push` destructivo. La primera fecha comprometida registrada limita «Entrega anticipada»; la semana es lunes-domingo en Bogotá.
- Entrega personal autenticada desde `RecognitionRuntime`: permiso vigente, reserva exclusiva por usuario y confirmación persistente antes de mostrar. Revalidar identidad y recurso al confirmar; no repetir por pestañas/reintentos. No desplazar un aviso visible, interrumpir modales ni reproducir avisos de más de 24 horas. La muestra simulada desactiva expresamente este runtime.
- La prueba PostgreSQL usa exclusivamente `TEST_DATABASE_URL` en el clúster aislado validado; nunca `.env` productivo para pruebas/seed/limpieza. Diferenciar capturas simuladas, prueba real local de API/DB y despliegue productivo confirmado.
