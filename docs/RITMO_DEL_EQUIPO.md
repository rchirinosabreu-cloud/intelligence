# Ritmo del equipo

Rodny, 9 de octubre de 2026: «siento que aún no hay forma de analizar los tiempos, de leer al miembro del equipo … si Brayan hace en un día dos vídeos y en cada uno se demora 4 horas, eso hay que revisarlo … si en un vídeo se demora 5 horas y en otro 30 minutos, hay que ver por qué tanta diferencia. Y eso va para todos».

## Dónde vive

- **Pestaña Ritmo de Manager** (`/manager?tab=ritmo`). Lleva lo que antes estaba en Observer sobre tiempos (esfuerzo registrado, distribuciones, calidad del dato, sesiones recientes) y, encima, la lectura por persona. Observer se queda solo con la bandeja de señales.
- **Servidor:** `GET /api/manager/rhythm?days=7|30|90` (`teamRhythmService.js`), con la misma puerta que el resto de Manager: módulo Manager y rol de administrador o project manager.
- **Bria:** la herramienta `ritmo_del_equipo` lee el mismo cálculo, con la misma puerta. Una respuesta guardada deja de mostrarse a quien pierde ese acceso (`authorizeTurn`, fuente `ritmo`).

## Qué calcula

Por persona y por tipo de trabajo, sobre las tareas cerradas del periodo (`src/lib/teamRhythm.js`, lógica pura):

1. **Cobertura primero.** Cuánto de lo cerrado tiene tiempo medido. Lo que pasó a Realizada sin pasar por En proceso **no es rápido, no se midió**, y la pantalla lo dice antes que cualquier cifra. Menos de 10 minutos no cuenta como medición.
2. **Cuánto suele tardar.** Mediana y rango por tipo de trabajo, y la mediana del resto del equipo en el mismo tipo.
3. **Hallazgos.** Cada uno es una pregunta con las tareas que lo sustentan, nunca un juicio sobre la persona:
   - **Disparejo:** pocas tareas del mismo tipo muy distintas entre sí (la más larga cuatro veces la más corta).
   - **Fuera de lo habitual:** con cinco o más, las que tomaron tres veces la mediana y al menos 2 h.
   - **Comparación con el equipo:** solo con tres o más tareas de cada lado; más lento o más rápido por un factor de 1,5 o 0,5.
   - **Día cargado:** varias tareas del mismo tipo el mismo día que suman 6 h o más.
   - **Día largo:** 10 h o más medidas en un día, sea cual sea el trabajo.
   - **Retrabajo:** tiempo después de una devolución.
   - **Reloj olvidado:** una sesión de más de 8 h no se cuenta como trabajo; se avisa aparte.
   - **Relojes simultáneos:** una sesión abierta mientras la misma persona tenía otra corriendo (`isOverlapping`) no se suma; se avisa aparte. Pasaba al mover varias tareas a la vez a En proceso: tres publicaciones de 4 h 48 min cada una eran el mismo tiempo contado tres veces.

## Decisiones que no se ven a simple vista

- **El tiempo es de quien trabajó** (`TaskWorkSession.workerId`), no del responsable actual: una tarea reasignada no le cuenta a la persona nueva las horas de la anterior. Los colaboradores reciben sus propias horas.
- **El tipo de trabajo** sale del formato de la pieza (Reel, Carrusel, Post, Video, Historia), de «Publicación» si es una tarea de publicar, y si no, de la categoría de la tarea.
- **Solo se compara trabajo homogéneo.** «Operaciones & Reuniones» es la categoría de relleno del clasificador y «Marketing & Social Media» mezcla redactar una parrilla con responder mensajes: se muestran como «mezcla trabajos distintos» y nunca se comparan ni se llaman dispares.
- **Las tareas anteriores a las sesiones** conservan el tiempo acumulado que ya tenían (`accumulatedWorkMs`).

## Lo que mostró la primera lectura real (30 días, 9 de octubre de 2026)

- La cobertura del equipo es del 56 %, con personas por debajo del 15 %. Mientras eso no suba, los tiempos de esas personas no se pueden leer.
- Hay relojes que nadie pausa (sesiones de más de 8 h) y tiempo duplicado por relojes simultáneos.

## Pruebas y muestra

- Contratos: `tests/teamRhythm.test.js`, `tests/teamRhythmService.test.js`, `tests/teamRhythmAccess.test.js`, `tests/teamRhythmUi.test.js`.
- Muestra local con personas inventadas: `tests/fixtures/team-rhythm-preview.html` (`?tab=ritmo`, `?tab=observer`, `&dark`).
