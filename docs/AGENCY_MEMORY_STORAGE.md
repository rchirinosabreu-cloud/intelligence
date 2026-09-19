# Memoria de la agencia: bucket propio para minutas y Drive

Decisión de Rodny, 19 de septiembre de 2026: las minutas automáticas (transcripciones, actas y sus PDF) y los archivos del Drive de la agencia son la memoria que alimentan la corrección de parrillas y el algoritmo de Brain. No pueden seguir en `chat-evidence`, el bucket compartido de chat y tareas que tiene limpieza automática. Viven en el bucket propio **`agency-memory`** de Railway.

## Cómo está conectado

- `src/services/documentStorageService.js` es la única capa que escribe y lee minutas y Drive. Toma primero las variables `BRIA_STORAGE_*` y solo cae al bucket de chat si faltan, avisando en consola con `AGENCY_MEMORY_SHARED_BUCKET`.
- Variables del servicio Intelligence (referencias al bucket, no valores copiados):
  - `BRIA_STORAGE_BUCKET` (obligatoria)
  - `BRIA_STORAGE_ACCESS_KEY_ID` (obligatoria)
  - `BRIA_STORAGE_SECRET_ACCESS_KEY` (obligatoria)
  - `BRIA_STORAGE_ENDPOINT` (opcional; por defecto el endpoint S3 de Railway)
- En la base de datos solo hay claves relativas (`MeetingMinute.*StorageKey`, `DriveFile.storageKey`), nunca URLs con bucket. Cambiar de bucket no toca ninguna fila. Todo se sirve por el proxy autenticado de `/api/drive`.
- Prefijos: `bria/minutes/<año>/<id de reunión>/…` y `drive/uploads/<año>/…`.

## Traslado desde el bucket de chat

`scripts/copy-agency-memory-objects.js` copia los dos prefijos del bucket de origen (`AWS_*` o `SOURCE_S3_*`) al de destino (`BRIA_STORAGE_*`). Es una copia, nunca un traslado: no borra nada en ningún bucket, salta lo que ya está con el mismo tamaño, vuelve a copiar lo que difiere y verifica el tamaño de cada objeto al llegar. Sin argumentos solo simula; escribe con `--confirm COPIAR`. Se puede repetir las veces que haga falta (por ejemplo, después del cambio de variables, para recoger las minutas que el sincronizador de Fireflies escribió en el bucket viejo entre la primera copia y el despliegue).

Orden seguro del cambio: copiar, poner las variables, dejar que Railway redespliegue, volver a ejecutar la copia para lo que haya llegado en medio, y comprobar en Drive que una minuta y un PDF abren.

`scripts/delete-migrated-agency-memory-objects.js` limpia después el bucket de origen: solo borra las claves de los dos prefijos que existen en el destino con el mismo tamaño, y vuelve a comprobar cada una con `HeadObject` justo antes de borrar; lo que falte o difiera se conserva y se lista. Nunca borra en el destino. Simula por defecto; escribe con `--confirm BORRAR`.

### Traslado ejecutado el 19 de septiembre de 2026

Bucket `agency-memory` creado con la CLI de Railway (región sjc, nombre real `agency-memory-snvcqfokuqk`). Copiados 204 objetos (256,6 MB) de `chat-evidence` con verificación de tamaño; variables `BRIA_STORAGE_*` puestas como referencias al bucket; redespliegue en verde; segunda pasada sin diferencias; después, borrado en `chat-evidence` de las 204 claves verificadas. Los activos finales de parrillas (`content-plans/…`) y los adjuntos de tareas y chat siguen en `chat-evidence`: no forman parte de la memoria de minutas y no se tocaron.

## Verificación

`tests/agencyMemoryStorage.test.js`: prefijos, configuración con buckets distintos, plan de copia y contratos de «nunca borrar». La copia real y la lectura posterior se comprueban en producción con la CLI de Railway y abriendo una minuta.
