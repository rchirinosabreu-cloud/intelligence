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

## 4. Componentes y UI Elements
- **Boring Avatars:** Se utiliza la librería `boring-avatars` para los avatares en toda la aplicación (Dashboard, CampfireWidget, Tasks). Siempre respeta su importación y uso en los componentes en lugar de depender exclusivamente de imágenes estáticas, a menos que se especifique lo contrario.
- **React Datepicker:** (Si se especifica o está instalado) Debe integrarse correctamente y utilizar los estilos oscuros (`react-datepicker/dist/react-datepicker.css`), asegurándose de no romper la estética general del formulario en modals (e.g., bordes redondos, fondos transparentes, hover oscuro).

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
