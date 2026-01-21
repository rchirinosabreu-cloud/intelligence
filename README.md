# Brainstudio Intelligence

Interfaz de chat minimalista estilo ChatGPT, preparada para conectarse a OpenAI o Gemini con streaming.

## Requisitos

- Node.js 18+
- API key válida para el proveedor elegido

## Variables de entorno

Crea un archivo `.env` con:

```
API_KEY=tu_api_key
PROVIDER=openai
```

`PROVIDER` acepta `openai` o `gemini`.

## Desarrollo

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`.

## Build

```bash
npm run build
npm start
```

## Deploy en Railway

1. Conecta este repo en Railway.
2. Define las variables de entorno `API_KEY` y `PROVIDER`.
3. Usa el comando de build `npm run build` y start `npm start`.

## Estructura clave

- `app/page.tsx`: UI del chat y streaming en cliente.
- `app/api/chat/route.ts`: endpoint `/api/chat` con streaming.
- `lib/ai/prompt.ts`: system prompt centralizado.
