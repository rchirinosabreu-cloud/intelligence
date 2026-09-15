# Reportes con evidencia: implementación y verificación

## Estado al cierre de la verificación local

Implementación local del flujo de ingesta, revisión persistente, análisis y PDF. La base productiva, Drive y las variables del despliegue no fueron modificados. No se ha desplegado esta versión ni se han publicado informes de clientes.

El nuevo flujo conserva cada observación y su fuente, separa Facebook, Instagram, contenido combinado y pauta, y rechaza la publicación cuando detecta conflictos. Esto mejora la integridad del informe; no garantiza que un modelo interprete correctamente todos los píxeles. La evaluación real encontró errores incluso con confianza alta.

Antecedente público: [auditoría técnica](REPORTS_AUDIT_2026-09-15.md). Las capturas originales y la evaluación identificable de clientes permanecen en documentos locales excluidos de Git.

## Comportamiento implementado

| Etapa | Resultado |
|---|---|
| Carga | Hasta 14 capturas y un logo independiente. Se mantienen las categorías declaradas; el logo nunca se envía como evidencia de métricas. Cada captura recibe identidad, huella y nombre de almacenamiento único, incluso cuando dos archivos se llaman igual. |
| Lectura | Conserva cero, ausencia, abreviación, unidades, variación propia, período y procedencia. JSON incompleto se rechaza; no se repara inventando el contenido que falta. |
| Conciliación | No suma capturas duplicadas, campañas con sus anuncios, ni alcance como personas únicas. Totales y componentes se comprueban solo cuando existe una relación explícita compatible. |
| Plataformas | La red pertenece a cada observación. Una captura puede contener varias redes. La distribución de Instagram en Facebook no se presume equivalente al resumen propio de Facebook. |
| Contexto | Los formatos tienen identidad distinta del total de cuenta. Una base como «Según 200 contenidos» y un contador de recomendaciones de la interfaz no se aceptan como resultados del período. |
| Revisión | Permite corregir valor, variación porcentual con signo, red, distribución, precisión, unidad, período y contexto, con motivo e historial. Las celdas de tabla se identifican por panel, fila y columna. |
| Consistencia | Las correcciones numéricas se propagan únicamente por referencias inequívocas entre observación y celda. Cambios contradictorios se rechazan. Un enlace que contradice red, distribución, unidad o período bloquea la publicación y no autoriza copiar cifras. |
| Excepciones | Capturas fallidas, observaciones y paneles pueden excluirse con motivo. El anexo conserva esas exclusiones. Excluir una observación no permite que su panel vuelva a publicar la cifra. |
| Análisis | La IA propone interpretaciones y acciones citando hechos existentes. El servidor escribe las frases numéricas a partir de esos hechos. Se rechazan referencias desconocidas, cifras libres y varias conclusiones no sustentadas. Editar datos invalida el análisis anterior. |
| Guardado | Cada modificación exige la versión leída. PostgreSQL comprueba esa versión en la escritura; una operación atrasada devuelve 409 y no sustituye el trabajo más reciente. |
| Historial | Recupera informes por cliente con paginación, conserva la selección al refrescar y muestra errores reales. Los informes antiguos siguen visibles, en modo de lectura, con aviso de reingesta. |
| Salida | La vista previa y el PDF parten del mismo documento y versión guardada. El PDF final exige aprobación, análisis vigente y ausencia de conflictos bloqueantes. Revalida la versión al finalizar el renderizado. |

## Presentación

- Portada, resumen ejecutivo, resultados por plataforma, formatos, pauta, acciones y metodología con fuentes numeradas.
- Valores abreviados marcados con `≈`; datos ausentes como «No disponible»; cada indicador conserva su variación.
- Tablas con encabezados repetidos, filas protegidas y barras discretas calculadas únicamente con los valores observados de una serie.
- Logo raster embebido en el documento: PNG, JPEG o WebP de hasta 1 MB; no necesita una URL temporal para imprimirse.
- PDF A4 vertical con páginas numeradas. La muestra de prueba tiene ocho páginas y mantiene juntos sus siete anuncios.
- Interfaz revisada en claro y oscuro, escritorio y móvil; controles compartidos y vista de la captura original autenticada.

## Verificación realizada

### Código y persistencia

- **243 pruebas aprobadas, cero fallos.** La ejecución general omite una integración PostgreSQL sin activación explícita y `TEST_DATABASE_URL`; esa integración se ejecutó por separado contra la base aislada y pasó. Incluye extracción, conciliación, contexto, revisión, publicación, concurrencia, presentación, historial y exportación. Registro final: `tmp/reports-implementation/prepush-tests.log`.
- **PostgreSQL 17.11 real: 7/7 pruebas aprobadas, sin omisiones.** Esquema completo en contenedor exclusivo, con extensión vector. Dos conexiones compitiendo producen exactamente una escritura y un conflicto. También se verificaron relectura, análisis atrasado y conservación de datos ante fallo del proveedor.
- El contenedor de prueba se eliminó y los dos contenedores preexistentes quedaron intactos. Nunca se usó la conexión productiva. Evidencia: `tmp/reports-implementation/report-postgres-verification.json`.
- Compilación Vite completa aprobada. Persisten avisos generales de dependencias/chunks grandes; no hubo error de compilación. ESLint de los archivos cambiados y comprobación de espacios aprobados.

### Navegador y PDF

- Once comprobaciones del editor y cinco recorridos del módulo completo con API simulada: error sin falso éxito, borrador conservado ante 409, fuente correcta, variación negativa, categorías, historial, informes antiguos protegidos y descarga.
- Capturas a 1440 y 390 píxeles, ambos temas; sin errores de página ni desbordamiento horizontal.
- PDF real generado en Chromium y renderizado con Poppler. Se cotejaron 18 cifras, ocho páginas, numeración, marca de borrador y tabla de anuncios completa. No hubo solicitudes externas durante el renderizado de la muestra.
- La simulación del navegador no certifica autenticación, almacenamiento ni entrega HTTP del despliegue. Las comprobaciones de PostgreSQL y PDF sí usan motores reales locales.

### API real

- Se evaluaron exclusivamente las 14 capturas autorizadas de dos clientes. Las otras 41 capturas del inventario no se enviaron a la API ni se presentan como verificadas.
- La comparación de modelos, cifras mal leídas y asociaciones incorrectas está documentada en la evaluación local de visión. Las respuestas originales permanecen en los artefactos locales; no se sustituyeron por la transcripción esperada.
- Una llamada adicional probó el nuevo análisis con una transcripción compuesta de un cliente: cinco referencias válidas, cifras escritas desde el registro y conservación del cero. Es una prueba del análisis, no una validación de la ingesta completa ni una aprobación humana.

## Archivos principales

- `src/lib/reportEvidence.js`: identidad, normalización, conciliación y conflictos.
- `src/services/reportVisionService.js`: esquema, instrucciones, limpieza y proveedor de visión.
- `src/services/reportWorkflowService.js`: correcciones, historial, versiones, publicación y análisis referenciado.
- `src/routes/api/reportEvidenceRoutes.js`: orquestación inyectable de ingesta y operaciones persistentes.
- `src/routes/api/reports.js`: integración de las rutas activas.
- `src/components/reports/ReportEvidenceWorkspace.jsx` y `ReportHistory.jsx`: revisión y recuperación.
- `src/components/modules/Reports.jsx`: carga e integración del flujo nuevo.
- `src/services/metricReportPdf.js` y `src/lib/reportEvidenceFormat.js`: documento compartido y formato de valores.
- `scripts/eval-report-captures.mjs`: evaluación reproducible de archivos autorizados; admite `--dry-run` y referencias privadas mediante `--references archivo-local.json`.

## Límites y puesta en uso

1. **No prometer cero errores de lectura.** Los conflictos detectados se bloquean, pero una cifra incorrecta coherente consigo misma puede requerir comparación con la captura. La aprobación exige revisión del responsable.
2. **Confirmar el contexto ausente.** En varias fuentes no está visible el período completo o la moneda ISO. El año/período de las muestras locales no constituye evidencia del filtro original. No declarar COP solo por el símbolo `$`.
3. **Modelo de visión.** Se eliminó el respaldo accidental `gpt-5` y se respeta la configuración central. `OPENAI_MODEL_REPORT_VISION` permite evaluar/configurar reportes por separado. No se cambiaron variables de producción ni se promovió automáticamente el candidato por superar un subconjunto de comprobaciones.
4. **Duración y recuperación.** La ingesta sigue siendo una solicitud que espera todas sus capturas, con concurrencia limitada. La evaluación midió solicitudes individuales de varios minutos. No se implementó todavía una cola durable que sobreviva a reinicios; comprobar la operación completa en el despliegue antes de adoptarla de forma general.
5. **Publicación coordinada.** Frontend y backend deben publicarse juntos. Los datos v2 usan JSON existente; no se cambió `schema.prisma`, CORS ni las reglas de acceso. Los informes históricos requieren reingesta para adquirir evidencia por cifra; no se convierten por inferencia.
6. **Aceptación pendiente.** Cotejar el informe de cada cliente con sus capturas, aprobar las correcciones y validar la descarga autenticada en el entorno desplegado. Las pruebas locales no sustituyen esa aceptación.

## Muestras locales

- PDF local de verificación: muestra de documento con transcripciones del asistente, marcada como borrador.
- `tmp/reports-implementation/reports-complete-1440-light.png`: módulo completo en escritorio.
- `tmp/reports-implementation/reports-complete-390-dark.png`: módulo completo en móvil oscuro.
- `tmp/reports-implementation/workspace-editor-light.png`: editor de evidencia.
- JSON local del análisis: prueba real del análisis, con alcance declarado.

Los artefactos contienen capturas y resultados de clientes; permanecen locales. Están excluidos de Git. El push contiene código, documentación técnica y pruebas anonimizadas.
