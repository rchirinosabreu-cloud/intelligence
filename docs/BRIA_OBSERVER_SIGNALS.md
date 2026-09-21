# Observer: resolución duradera y señales con cita comprobada

Cambio del 21 de septiembre de 2026 (ítems A0-1 y A0-2 del [plan de autonomía](BRIA_AUTONOMY_PLAN.md)). Corrige el hallazgo P1-03 de la [auditoría del 14 de septiembre](BRIA_AUTONOMY_AUDIT_2026-09-14.md) y el N-04 de la [del 19](BRIA_AUTONOMY_AUDIT_2026-09-19.md), abiertos desde que Observer existe.

## Qué estaba mal

- **Una señal atendida volvía sola.** `upsertDetection` convertía `RESOLVED` en `OPEN` ante la misma clave, así que releer la misma minuta cada diez minutos reabría lo que una persona ya había cerrado. El diagnóstico del 20 de septiembre lo explica: 284 señales archivadas y 8 abiertas, **ninguna con acción humana registrada**. La bandeja no se usa, y esta era una de las razones.
- **La resolución por ausencia se aplicaba fuera de lo leído.** El detector lee como máximo 500 minutas; todo lo que no apareciera en esa lectura se marcaba resuelto, aunque nunca se hubiera examinado.
- **La evidencia se rellenaba sola.** Si el modelo no citaba nada, se usaba el resumen ejecutivo y, si tampoco había, el texto fijo «Detectado en el análisis de la minuta». Una señal sin respaldo llegaba a la bandeja pareciendo sustentada.
- **`ARCHIVED` no era un estado filtrable:** faltaba en la lista de estados válidos, así que pedir las archivadas devolvía las abiertas.

## Qué hace ahora

**Una decisión humana se respeta hasta que la evidencia cambie.** Cada detección lleva `evidenceVersion`, una huella de lo que la produjo (tipo, título, cita, severidad y acción sugerida). Una señal `RESOLVED` o `DISMISSED` solo se reabre si esa huella cambia; una relectura idéntica únicamente refresca `lastDetectedAt`. Las `ARCHIVED` de la línea base nunca vuelven a la bandeja. Al reabrirse se limpian `resolvedAt`, `dismissedAt` y `snoozedUntil`, de modo que el estado no queda a medias.

**Solo se resuelve por ausencia lo que se examinó.** `resolveMissing` acepta el alcance real de la lectura (`scopeRecordIds`) y el reconciliador le pasa los identificadores de las minutas leídas en ese escaneo. Una fuente fuera de la ventana es desconocida, no resuelta. `TASK_ANALYTICS` tiene una sola fuente global y conserva su comportamiento.

**Sin cita comprobada, la señal no es trabajo listo.** `isQuotedInTranscript` exige que la evidencia del modelo aparezca literalmente en la transcripción, normalizando espacios y mayúsculas pero no las palabras, y descarta fragmentos de menos de doce caracteres, que coincidirían con casi cualquier texto. El resultado se guarda en `grounding`:

| Valor | Significado |
|---|---|
| `QUOTED` | La cita aparece literal en la transcripción |
| `DETERMINISTIC` | Regla de umbral sobre datos reales de tareas; no la escribió un modelo |
| `UNVERIFIED` | El modelo afirmó algo que no se encontró en la transcripción |
| `null` | Señales anteriores a este cambio: nunca se evaluaron, se siguen mostrando como antes |

Nada se rellena: si no hay cita utilizable se muestra la descripción del propio modelo, nunca el resumen ni una frase inventada. Las `UNVERIFIED` salen de la lista activa, se cuentan aparte (`summary.unverified`), tienen su propio filtro «Sin confirmar» y, al abrirlas, avisan de que la cita no se encontró. No se borran: son la medida de cuánto inventa el modelo.

## Qué se conserva

Las señales existentes no se tocan ni se reclasifican: su `grounding` queda vacío y siguen visibles. Las acciones de la bandeja (revisar, aplazar, descartar, resolver, reabrir) no cambian. Observer sigue sin ejecutar nada: solo observa y presenta. El cambio de esquema son dos columnas de texto nullable creadas con `ADD COLUMN IF NOT EXISTS` por `scripts/ensure-bria-observer-schema.js`.

## Verificación

`tests/briaObserverSignals.test.js` cubre cita literal con espaciado y mayúsculas distintas, cita fabricada, cita ausente o trivial, huella de evidencia, cierre que no se reabre por relectura (resuelta, descartada y archivada), reapertura con evidencia nueva, alcance de la resolución por ausencia, y la bandeja con su contador y sus filtros. `tests/briaObserverUi.test.js` vigila el filtro y el aviso. `tests/browser/briaObserverInbox.mjs` renderiza la bandeja con Playwright en escritorio y móvil, claro y oscuro: las no confirmadas no aparecen entre las activas, el contador se muestra y el aviso se explica al filtrarlas; capturas en `output/bria-observer-*.png`.

No se llamó al modelo real ni se tocó la base productiva. Estas pruebas verifican la lógica de resolución y de cita, no la calidad editorial de las señales.

## Lo que sigue pendiente

Observer sigue siendo un detector que muestra, no un coordinador: resolver una señal no comprueba que el problema se haya arreglado, solo registra la decisión de la persona. La comprobación real de cumplimiento llega con la coordinación de compromisos (bloque B del plan). Y como la bandeja no se usa, los avisos que importen deben llegar por notificación a su responsable, no solo aquí.
