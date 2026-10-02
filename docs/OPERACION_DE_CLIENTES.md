# Operación de clientes

Decisión de Rodny, 1 y 2 de octubre de 2026: dejar el Excel «PENDIENTES BRAIN STUDIO 2026» y trabajar en la plataforma. **Lo que dice la plataforma es lo que se refleja en la operación.**

## Qué reemplaza

| Excel | Plataforma |
|---|---|
| Cliente, Definición, Link de Instagram | Ficha operativa |
| Fecha de inicio y terminación | Contrato: vigencia (avisa si vence o venció) |
| Contenidos, Servicio | Contrato: piezas por formato y nota libre |
| Producción / jornadas, historias | Contrato: jornadas al mes, historias por semana |
| Project manager, CM, Responsable | Ficha operativa: `projectManagerId` y `responsibleId` |
| Agencia (BRAIN/MIO), Nivel de complejidad | Ficha operativa, filtro del tablero |
| Informe MES | Informe entregado por mes, con quién y cuándo |
| Estado, % del mes, estados de redacción/diseño/aprobación/programación | Calculado con la parrilla |
| Comentario (INDICADORES) y OBSERVACIONES (MIO) | Sección «Observaciones» de cada cliente, con su origen; la última también en el tablero |
| Bloque HISTORIAS (MIO) | Contrato: historias por semana |
| Stand by / Servicios | Estado «Stand by» y tipo «Servicios» |
| Colaborador / Acción destacada / Clientes a cargo | Pestaña «Equipo», con la acción destacada editable |
| Hojas de enero, febrero y marzo | Gestión |
| Estado de pauta | Fuera de alcance (decisión de Rodny) |

## Cómo se calcula

- El ciclo de una parrilla va del día de corte al día anterior del mes siguiente; con corte 1 es el mes calendario. La parrilla del mes M es la `ContentPlan` de ese mes.
- Cada pieza llega a una etapa según lo que tiene (`pieceStage`): texto escrito → redactada; pieza final → diseñada; aprobada por el cliente → aprobada; con «Programar» en Meta → programada; `PUBLICADO` → publicada.
- El semáforo y sus motivos: `evaluateClientOperation` en `src/lib/clientOperations.js`. Umbrales: más de 3 días entre publicaciones, rojo sin parrilla desde el día 5, aviso de contrato a 30 días.

## Quién la ve

Administradores y project managers: pestañas «Operación» y «Equipo» en Clientes y la página `/clientes/operacion/:slug`. El resto del equipo ve el directorio.

## Cargar el Excel una sola vez

La plataforma manda: el Excel solo llena campos vacíos, quien ya tiene contrato no recibe otro, no se crean clientes y no se tocan los archivados. Todo lo que no coincide o no se entiende queda en el informe.

```
node scripts/import-client-operations-excel.js "PENDIENTES BRAIN STUDIO 2026.xlsx"
```

Eso solo simula y deja `informe-carga-operacion-<fecha>.md`. Después de revisarlo:

```
node scripts/import-client-operations-excel.js "PENDIENTES BRAIN STUDIO 2026.xlsx" --confirm IMPORTAR --crear-tareas --creador <correo>
```

Cada cliente se guarda en su propia transacción y volver a correrlo no duplica contratos ni tareas.

Lo que la carga no adivina y deja como duda: el día de corte (siempre 1; si el contrato empieza otro día se avisa), «carretes» (se leen como carrusel), contenidos sin desglose (se cargan como formato «Otro») y vigencias sin dos fechas (el contrato arranca el 1 del mes en curso).
