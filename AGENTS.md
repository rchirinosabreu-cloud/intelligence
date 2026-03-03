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