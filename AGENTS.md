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
- Aprobar o revocar criterios invalida las revisiones en curso del cliente. Las parrillas activas se encolan; las finalizadas sin verificación solicitada quedan `STALE`, no en una espera automática infinita. El hash de publicación incluye los criterios aprobados y sus versiones.
- Solo un admin activo con acceso a parrillas puede eliminar definitivamente un criterio, en cualquier estado. Exigir confirmación `ELIMINAR`, versión vigente y cliente coincidente en backend. Se elimina el registro y su historial; no las revisiones antiguas. Si estaba aprobado, invalidar/encolar revisiones en la misma transacción y orden de bloqueos que aprobar/revocar. Revocar sigue siendo la alternativa que conserva historial.
- En criterios de Bria, «Proponer criterio» va debajo del texto introductorio. Aprobar/rechazar/revocar/eliminar se muestran como acciones de texto, sin relleno ni borde, con el token destructivo global y área táctil mínima de 44 px. `brain-destructive-text` deriva el contraste oscuro del mismo token; nunca introducir otro rojo local.
- El cálculo `traceable` es candidato de evaluación, no el predeterminado productivo. Exige chequeos explícitos por pieza/regla y citas existentes; las limitaciones de cobertura se muestran aparte. Un descuento explicable no garantiza que el juicio editorial sea correcto. El formato estricto y el razonamiento adicional son opt-in y no alteran los usos existentes del proveedor.
- En diálogos nuevos de Bria, `brain-ai-header` centraliza el degradado verde/cian con contraste para texto blanco. Mantener mascota pequeña sobre blanco, cuerpos neutros, controles táctiles y la etiqueta de candidato en previsualizaciones experimentales.
