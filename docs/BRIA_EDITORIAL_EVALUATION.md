# Bria: rúbrica y evaluación editorial

Fecha: 5 de septiembre de 2026 (Bogotá).

## Estado y alcance

El bloque de cobertura `bae427d` está desplegado en Railway (`1da6b7ee-85f6-4057-a831-8600078d808a`, SUCCESS). Este bloque posterior prepara la calibración editorial **local**, no cambia la rúbrica productiva ni activa un nuevo modelo. No modifica esquema, datos de clientes, permisos de la aplicación, puntajes compartidos ni interfaz.

La producción conserva `content-plan-review-v4`, incluidos prompt, esquema, pesos, límites y filtros. La extracción del contrato/generador permite que las evaluaciones usen el mismo procesamiento por lotes que la aplicación, sin importar Prisma, calendarios, cron ni acceso a memoria. Una prueba congela el texto exacto del prompt anterior. La candidata solo se selecciona mediante `variant: 'candidate'` en el evaluador; el servicio productivo utiliza el valor base.

La rúbrica candidata `bria-editorial-v1` incluye 11 reglas, anclas de puntaje, niveles de severidad y políticas sobre contexto ausente, instrucciones actuales, comentarios antiguos y contenido no visible. Mantiene los pesos 30/25/25/20. Su huella SHA-256 acompaña los reportes y separa los checkpoints de otras variantes. **No está aprobada para promoción.**

## Banco de casos y validación humana

`evals/bria/editorial-cases.js` contiene 36 controles sintéticos, todos DRAFT. No son parrillas reales ni ejemplos aprobados por usuarios. Cubren gramática, nombre/tono/restricciones de marca, objetivos y CTA, contradicciones, fechas, duplicación, ausencia de memoria, instrucciones maliciosas dentro del texto y comentarios antiguos ya atendidos.

La persona responsable de la parrilla es el validador editorial principal. Project managers y admins también pueden validar. Esto es una regla de gobierno acordada con el usuario; este bloque la documenta, **no implementa todavía una pantalla ni un endpoint de aprobación**. El flujo posterior debe comprobar permisos en el servidor, no confiar en un rol enviado desde el navegador.

Para incorporar casos reales al piloto:

1. El responsable, PM o admin revisa una instantánea concreta y distingue defecto, falso positivo, sugerencia opcional e incertidumbre.
2. Registrar cliente/parrilla, versión, quién validó, fecha, evidencia y motivo. Mantener decisiones de un cliente aisladas de los demás.
3. Anonimizar contenido, enlaces, nombres y datos comerciales antes de versionar ejemplos. No copiar transcripciones ni credenciales al repositorio.
4. Resolver desacuerdos y separar ejemplos de ajuste de los casos reservados de validación. Un descarte aislado no se convierte automáticamente en memoria permanente.
5. Comparar la candidata contra la versión vigente y decidir su promoción explícitamente. Registrar la decisión y conservar una vía de reversión.

El validador de archivos solo comprueba integridad estructural/procedencia; un campo `approvedBy` en un archivo no autentica a nadie ni concede permisos en la plataforma.

## Ejecución local

Validación segura por defecto, sin modelo, red ni base de datos:

```powershell
npm run eval:bria
```

Muestra cantidad de casos, huella y presupuesto, **no resultados simulados de calidad**. Para una medición real se requiere opt-in y la clave del proveedor configurada externamente; el script no carga `.env` por sí solo:

```powershell
node --env-file=.env scripts/eval-bria-reviews.js --live --cases number-defect,number-control,no-client-memory,old-feedback-not-current --repeats 2 --max-calls 8
```

`--variant baseline` utiliza el prompt productivo; `candidate` es el valor predeterminado del evaluador, no de producción. El banco completo necesita 36 llamadas por repetición. El presupuesto incluye lotes y repeticiones y se valida antes de contactar al proveedor. Límite de 1–5 repeticiones, máximo 200 llamadas por ejecución, 90 s por llamada según el cliente y 20 minutos globales. Si expira el tiempo global, el comando falla; no promete un reporte completo de una ejecución abortada.

Los JSON se crean sin sobrescritura bajo `output/bria-evals/`, excluido de Git. Incluyen respuestas procesadas, huellas de dataset/entrada/rúbrica, modelo efectivo, request IDs, uso de tokens, latencias y fallos. Los resultados esperados nunca se incluyen en el prompt. No hay escritura a la base de datos, herramientas de agencia ni publicación de datasets a una plataforma externa.

## Qué significan las métricas

| Medición | Interpretación y límite |
|---|---|
| Contrato/cobertura | Respuesta válida y confirmación de todas las piezas; no demuestra buen juicio editorial. |
| TP / FN | Detección/omisión de una regla esperada, con coincidencia de regla y pieza/campo cuando estén etiquetados. No es un juez semántico. |
| FP | Coincide con una prohibición explícita, o es extra en un caso declarado exhaustivo. |
| Sin adjudicar | Observación extra sin etiqueta humana; no se supone correcta ni falsa. |
| Precisión | Se omite (`null`) si el etiquetado no es exhaustivo. Nunca convertir ausencia de etiquetas en 100%. |
| Recall | Sobre las reglas etiquetadas, no sobre todos los errores posibles. `null` si no hay positivos o no existe vocabulario comparable. |
| Rango de puntaje | Coincidencia con anclas propuestas; aún no representan la opinión aprobada del equipo. |
| Deducciones sin respaldo | Dimensión evaluable con descuento, pero sin WARNING/CRITICAL asociado; señal para inspección, no corrección automática del puntaje. |
| Estabilidad | Dispersión del puntaje y coincidencia de hallazgos entre repeticiones de la misma entrada. No se calcula con una sola respuesta ni ocultando fallos. |
| Tokens y latencia | Mediciones conocidas del proveedor. Uso desconocido no equivale a cero; no se estima precio monetario sin tarifa verificada. |

El prompt base usa claves de reglas libres: sus TP/FP/FN no son comparables automáticamente con el catálogo candidato. Se conservan sus respuestas para adjudicación humana; sí se pueden comparar cobertura, puntajes, dimensiones, latencia y variación. El resultado nunca declara aprobación automática, incluso si todas las métricas salen bien.

## Mediciones reales, limitadas

Se ejecutaron dos rondas de 4 controles × 2 repeticiones = **16 llamadas en total** con `gpt-5.6-luna`, sin datos reales ni escrituras productivas. La primera ronda sirvió de diagnóstico técnico: el control limpio obtuvo 95 y 99 sin hallazgos. En la revisión del banco se detectó que sus IDs revelaban el nombre del caso; se neutralizaron y se añadió una regresión contra esas pistas. La primera ronda no se considera una evaluación editorial ciega.

La segunda ronda, con IDs neutros, completó las ocho respuestas. El defecto gramatical se detectó en ambas repeticiones, sin falsos positivos etiquetados ni observaciones adicionales en esta muestra. El cliente sin memoria y el comentario antiguo ya atendido no generaron alertas. Media observada: aproximadamente 4,26 s por llamada; 14.252 tokens de entrada y 2.563 de salida. El reporte local es `output/bria-evals/2026-09-06T03-08-17-326Z-candidate-dbd499fe-ede6-41bd-8f28-b351c7e4a70d.json`.

Persisten señales importantes:

- El control limpio obtuvo **100 y 95** sin hallazgos. Cinco de las ocho ejecuciones tuvieron deducciones sin un defecto asociado. No se cambiaron los puntajes del modelo para ocultarlo.
- El cliente sin memoria obtuvo 98 y 96; MARCA fue no evaluable en ambas repeticiones. Hubo una discrepancia con una etiqueta de borrador sobre la evaluabilidad de otra dimensión, que debe adjudicar el equipo: la etiqueta sintética tampoco es verdad absoluta.
- Los hallazgos coincidieron entre repeticiones, pero esto no demuestra estabilidad con otras parrillas ni a largo plazo.

La muestra es demasiado pequeña para validar precisión, generalización, calidad real de clientes o ahorro de tiempo. Los 36 casos están preparados; solo estos cuatro se midieron en las dos rondas. La candidata sigue pendiente de calibración, en particular del criterio de puntuación.

## Verificación técnica

Suite completa con PostgreSQL/pgvector local aislado: **884 pruebas correctas, 0 fallidas, 0 omitidas**. Incluye 20 pruebas nuevas sobre rúbrica, generación compartida, parsing con cercas JSON, contratos incompletos, IDs ajenos, etiquetas contradictorias, coincidencia uno a uno, ausencia de pistas/etiquetas en el prompt, métricas honestas y ejecución sin IA/BD por defecto. Estas pruebas no equivalen a aprobación editorial. Lint y build correctos; el build mantiene advertencias previas de Prisma, Browserslist, Bluebird y tamaño de chunks. No hubo cambios visuales en este bloque. Se apagó el contenedor de pruebas conservando sus datos.

## Siguiente entrega

1. Incorporar un conjunto pequeño de parrillas anonimizadas y adjudicadas por responsable/PM/admin, con el flujo de aprobación y sus permisos.
2. Calibrar puntuación y tratamiento de incertidumbre usando casos reservados; comparar respuestas y revisar descuentos no respaldados.
3. Vincular criterios aprobados al contexto vigente de cada cliente y a la invalidación de revisiones, conservando procedencia e historial.
4. Pilotear impacto operativo (tiempo hasta aprobación, falsos positivos, correcciones verificadas, coste y latencia) antes de ampliar autonomía.

La separación entre pruebas técnicas, métricas de modelo y validación humana sigue las [prácticas de evaluación de OpenAI](https://developers.openai.com/api/docs/guides/evaluation-best-practices). Se usa un evaluador propio reutilizando el cliente Responses existente, sin depender del servicio alojado de Evals.
