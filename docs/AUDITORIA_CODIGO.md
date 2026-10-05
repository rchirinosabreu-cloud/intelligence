# Auditoría de código muerto

Desde octubre de 2026 la integración continua revisa en cada cambio que no entre código que nada usa: archivos sueltos, dependencias que no se importan o importaciones que no apuntan a ningún sitio. La herramienta es [knip](https://knip.dev), configurada en `knip.jsonc`.

## Cómo se corre

```bash
npm run audit:dead-code          # lo mismo que corre la CI; si falla, la CI falla
npm run audit:dead-code:exports  # informe de exportaciones sin uso (solo avisa)
```

`audit:dead-code` hace dos pasadas:

1. **Pasada normal.** Parte del servidor (`server.js`, el script `start` de `package.json`), de la aplicación (`index.html` → `src/main.jsx`, por el plugin de Vite), del service worker (`public/*.js`), de los scripts de `scripts/` y de las pruebas, y sigue cada `import`. Falla si encuentra:
   - un archivo que nadie importa;
   - una dependencia de `package.json` que nadie usa, o un paquete que se usa sin estar en `package.json`;
   - una importación que no se resuelve o un binario que no existe.
2. **Pasada de producción** (`--production`). Repite la búsqueda de archivos, pero sin contar las pruebas. Falla si un archivo **solo lo usan las pruebas**: es código que la plataforma ya no ejecuta y que una prueba mantiene vivo artificialmente. Así se encontraron `QualityStreakWidget.jsx` o `EventActivityCard.jsx`, que solo aparecían en listas de «compila sin errores».

Las **exportaciones sin uso** (una función o constante exportada que ningún otro archivo importa) no hacen fallar la CI. Hoy hay unas noventa y casi todas son constantes o funciones que sí se usan dentro de su propio archivo; quitarles el `export` no cambia nada de lo que hace la plataforma y tocaría decenas de archivos a la vez. Se revisan con `audit:dead-code:exports` cuando se trabaja en ese archivo.

## Lo que knip no ve

Antes de borrar algo que knip marque, o de fiarse de que algo está vivo porque knip no lo marca, hay que comprobar a mano:

- **Rutas del servidor.** knip sabe si un archivo se importa, no si una ruta HTTP se llama. Que `src/routes/api/x.js` esté montado no significa que alguna pantalla use cada uno de sus endpoints. Para saberlo hay que buscar el `/api/...` en `src/` (con plantillas como `` `/api/content/${id}/...` ``), y recordar que los webhooks (Fireflies, Google Calendar) los llama alguien de fuera.
- **Archivos leídos como texto.** Muchas pruebas abren el código con `readFileSync('src/...')` para comprobar una regla. Ese archivo cuenta como usado aunque solo lo lea una prueba. La pasada de producción no lo cuenta.
- **Nombres en texto.** Una dependencia cargada por nombre (`presets: ['@babel/preset-react']`) o un archivo que se abre por ruta dinámica no aparece como `import`.
- **Datos.** knip no mira la base de datos: un modelo de Prisma sin uso **no se borra** por esta vía. Las tablas solo se retiran con una decisión explícita y un plan de migración.

## Cómo excluir algo a propósito

A veces algo no se usa todavía, o se queda por una decisión pendiente. En ese caso se añade a `knip.jsonc` **con un comentario que diga por qué y hasta cuándo**:

- un archivo: en `ignoreFiles`;
- una dependencia: en `ignoreDependencies`.

```jsonc
"ignoreFiles": [
  // Pendiente de decisión (octubre de 2026): <qué falta decidir y quién>.
  "src/components/ui/toaster.jsx"
]
```

Una exclusión sin motivo no se acepta en revisión. Cuando la decisión se toma, se borra la exclusión.

## Exclusiones vigentes

| Qué | Por qué |
| --- | --- |
| `src/components/ui/toast.jsx`, `src/components/ui/toaster.jsx` | Siete pantallas usan `useToast()` (`src/components/ui/use-toast.js`), pero `<Toaster />` no está montado en `App.jsx`, así que esos avisos no se ven. Estos archivos son el arreglo natural. Se borran cuando se decida si se monta el `<Toaster />` o si esas pantallas pasan a `react-hot-toast`, que es el que sí está montado. |
| `@babel/preset-react` | Las pruebas de compilación lo cargan por nombre dentro de `presets`. |

## Contratos relacionados

- `tests/deadCodeAudit.test.js`: la CI corre la auditoría y la configuración no se queda sin motivo en sus exclusiones.
- `tests/noGeminiProvider.test.js`: Gemini se retiró en octubre de 2026 y no puede volver código, configuración ni destinos de red suyos. OpenAI es el único proveedor de IA.
