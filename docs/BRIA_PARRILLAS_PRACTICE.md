# Parrillas con Bria: guía de práctica

## Qué estamos cerrando

Esta entrega prepara el flujo existente para practicar: revisión compartida, corrección con verificación, descarte justificado y criterios del cliente con aprobación humana. Simplifica la propuesta manual sin quitar trazabilidad.

**Cierre técnico del bloque, no certificación editorial.** Las pruebas con PostgreSQL y navegador comprueban comportamiento; las respuestas simuladas no demuestran que Bria siempre tenga buen criterio. La aceptación editorial y el ahorro real se validarán con el uso de esta semana.

## Dónde practicar y qué queda guardado

- En la plataforma publicada, las propuestas, decisiones, notas y cambios en piezas son **reales y persistentes**. No añadir reglas ficticias solo para comprobar botones.
- La muestra local `http://127.0.0.1:3005/tests/fixtures/bria-pilot.html` utiliza un cliente ficticio, PostgreSQL aislado e IA simulada. Sirve para probar el formulario y los permisos; no es memoria productiva. Cerrar normalmente ese servidor elimina únicamente sus propios datos de muestra.
- La muestra no sustituye la plataforma completa ni sirve para evaluar la calidad del modelo. Las muestras anteriores no se reemplazan ni se limpian al abrir esta nueva.

## Recorrido de la semana

Elegir una parrilla que ya estés trabajando, por ejemplo Aristea. Si resulta práctico, contrastarla después con un cliente con poco historial. No hace falta que todo el equipo ensaye a la vez.

### 1. Añadir una regla real

En **Criterios del cliente → Proponer criterio**, elegir categoría y escribir una regla concreta. Por ejemplo: «En esta cuenta, escribir en español de Colombia y evitar mayúsculas sostenidas salvo siglas», solo si ese es el acuerdo real.

**Añadir contexto** es opcional: se puede guardar sin desplegarlo. Usarlo si hay una guía, acuerdo o fuente útil. El historial conserva autor, fecha y versión aunque no haya contexto. «Sin contexto añadido» es una etiqueta de lectura, no una explicación fabricada por Bria.

Guardar crea una **propuesta**, no una regla aprobada. El responsable de la parrilla de origen, un PM o un admin puede validar. Aprobar, rechazar, revocar y ajustar un borrador conservan su motivo obligatorio. El motivo de decisión deja constancia de la validación; no es el contexto opcional de creación.

### 2. Revisar aprendizajes sugeridos

En **Criterios del cliente → Buscar aprendizajes**, Bria puede proponer reglas desde feedback de piezas, notas internas de piezas/parrillas y textos de piezas aprobadas/publicadas del mismo cliente.

Antes de aprobar, abrir **Ver detalle**:

- **Fuentes:** qué texto respalda la propuesta y de qué parrilla proviene. Una nota interna no equivale a un acuerdo autenticado del cliente; las fuentes antiguas pueden carecer de autor/fecha estructurados.
- **Alcance:** distinguir una regla del cliente de un acuerdo limitado a una parrilla. No generalizar una campaña a todos los meses.
- **Historial:** quién propuso, ajustó o decidió, cuándo y con qué motivo. Está plegado dentro del detalle.

Si el texto necesita cambios, usar **⋯ → Ajustar** antes de aprobar. Rechazar si no debe convertirse en regla. Las fuentes y el respaldo de propuestas de IA siguen siendo obligatorios. No hay extracción automática con cada comentario: se solicita con el botón.

### 3. Recorrer una corrección completa

1. Leer un hallazgo y usar **Ver pieza** para ir a su contenido.
2. Corregir y guardar la pieza.
3. Pulsar **Corregido** en el hallazgo: solicita verificación, no concede puntos ni lo cierra de inmediato.
4. Comprobar el resultado. Bria necesita verificar explícitamente ese hallazgo contra el contenido actual y respaldarlo con evidencia. Si persiste el problema, hay contradicción o evidencia insuficiente, debe seguir abierto con una explicación; desaparecer de una respuesta no demuestra resolución.
5. Si se marcó por error, deshacer la corrección pendiente. Si la revisión falla, consultar el estado y reintentar; no asumir que quedó corregido. Si una espera parece detenida, registrar enlace, hora y captura para revisarla.

La duración depende de cola, cantidad de piezas y proveedor; no hay una promesa de segundos exactos. Editar durante una revisión invalida resultados de la versión anterior. El puntaje se actualiza mediante una revisión completa compartida, no sumando puntos por cada clic en «Corregido».

### 4. Descartar lo que no aplica

Elegir un motivo; **Otro motivo** requiere explicación. Queda registrado en el historial de ese cliente/parrilla. Descartar no crea por sí solo memoria permanente, no aprueba una regla ni garantiza que evidencia nueva nunca motive otra observación.

### 5. Comprobar que es compartido

Con otro usuario autorizado, abrir la misma parrilla y verificar el resultado persistido y los criterios. No es necesario ejecutar una revisión por cada persona. Los controles pueden diferir por permisos; las decisiones guardadas y la revisión de la misma versión no deberían depender del usuario.

Para retirar una regla antes aprobada, **Revocar** deja historial y deja de utilizarla. **Eliminar** es exclusivo de admin y borra el criterio y su historial definitivamente; no usarlo como prueba en un cliente real. Las revisiones antiguas conservan su evidencia histórica.

## Qué contarnos al finalizar

Registrar únicamente casos relevantes, sin otra obligación en cada pieza:

| Dato | Qué anotar |
| --- | --- |
| Contexto | Enlace de la parrilla, pieza/hallazgo o criterio y momento aproximado |
| Resultado | Útil / no aplica / defecto que Bria omitió / fricción de uso |
| Criterio humano | Qué esperabas y por qué; quién lo validó |
| Evidencia | Texto o captura suficiente, sin información personal innecesaria |
| Tiempo, si se midió | Tiempo real de revisión de piezas comparables, no ahorro estimado por IA |

No evaluar productividad por horas abiertas, cantidad de clics o puntaje alto. Al revisar la semana, contar hallazgos útiles, falsos positivos y omisiones en la muestra; comparar tiempos solo si el trabajo es comparable e informar el tamaño de la muestra.

## Qué sigue después

1. Adjudicar los casos reales con responsables, PMs y admins y corregir los problemas reproducibles de mayor impacto.
2. Calibrar y comparar el **puntaje trazable candidato**; no se activa por completar este piloto. El motor productivo actual permanece separado.
3. Decidir si conviene extraer aprendizajes ante nuevos comentarios, con frecuencia, presupuesto, deduplicación y cola acordados. No ampliar automáticamente la autonomía.
4. Continuar la ruta general: brechas de integridad pendientes y contexto común autorizado/vigente; después **reunión → compromiso → tarea** y **foco diario → bloqueo → propuesta**.

Límites actuales: Drive, minutas y conversaciones de tareas no están incluidos en este extractor de criterios; requieren integrar contexto con permisos y vigencia. Los patrones detectables dependen de los lotes y la calidad histórica de las fuentes. No se promete conocimiento completo del cliente ni detectar todos los defectos.

## Comprobaciones técnicas de esta entrega · 6 de septiembre de 2026

- TDD: el caso manual sin contexto falló primero en unidad, servicio/PostgreSQL y formulario; después pasó con el nuevo contrato. Los motivos de decisiones/ajustes y de respuestas de IA se mantuvieron obligatorios.
- `npm run test:ci`: **926 pruebas, 926 correctas, 0 fallidas y 0 omitidas**, con `DATABASE_URL` y `TEST_DATABASE_URL` fijadas a PostgreSQL local aislado. Incluye regresiones de cola, concurrencia, invalidación al editar, omisión de verificación, deshacer y permisos. La suite combina pruebas de comportamiento y contratos de código; no equivale a navegar cada módulo de producción.
- `npm run lint`, `npx prisma validate` y `npx vite build`: correctos. Persisten avisos de tamaño de chunks, antigüedad de Browserslist y configuración Prisma obsoleta. Se comprobó la compilación del frontend, no una regeneración de la DLL Prisma utilizada por las muestras anteriores.
- Navegador con API simulada: criterios en seis variantes, acciones en seis, descubrimiento en cuatro y verificación en cinco; teclado, light/dark, viewport/zoom, errores y espera de respuesta del servidor. Capturas en `output/bria-criteria-*` y `output/bria-verification-*`.
- Dos recorridos con API y PostgreSQL locales reales: creación manual sin contexto, recarga/historial/aprobación y borrado solo admin; descubrimiento con fuentes persistidas y ajuste versionado. El proveedor de IA fue **simulado**, sin llamadas a modelos ni cambios en datos productivos.
- Muestra visual final: `output/bria-criteria-proposal-desktop.png` y `output/bria-criteria-context-mobile-dark.png`. No se hizo una validación editorial sobre parrillas reales ni se comprobó el despliegue productivo en estas pruebas locales.
