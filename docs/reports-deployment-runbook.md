# Verificación de despliegues del módulo Reportes

## Diferencia entre desplegar y actualizar

Railway vuelve a construir el commit asociado al deployment seleccionado. Un
`Deployment successful` confirma que ese commit arrancó correctamente; no
confirma que PRs o commits creados después estén incluidos.

Antes de probar una extracción:

1. Confirma que el PR con el fix más reciente esté fusionado en la rama que
   Railway tiene configurada como source.
2. Crea un deployment nuevo desde el SHA resultante de esa fusión. No uses
   `Redeploy` sobre un deployment anterior.
3. Abre `GET /api/reports/pipeline-status` sin autenticación.
4. Compara `commit` con el SHA mostrado en el deployment de Railway.
5. Confirma que `legacyFilterGuard` sea `true` y que `pipelineVersion` coincida
   con la versión esperada antes de subir imágenes.

## Diagnóstico de la versión actual

La versión que contiene el guard de compatibilidad global y el endpoint público
es `vision-2026-08-03.8`. Una respuesta `.4` demuestra que el deployment activo
corresponde a un PR anterior, aunque Railway indique que ese deployment fue
exitoso.

Respuesta esperada:

```json
{
  "pipelineVersion": "vision-2026-08-03.8",
  "commit": "<RAILWAY_GIT_COMMIT_SHA>",
  "legacyFilterGuard": true
}
```

