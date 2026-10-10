# Bria en vivo y entendiendo nombres mal escritos

Rodny, 9 de octubre de 2026: «siento que es súper lento el momento de respuesta … cómo hace uno para que sea como cuando uno habla con Claude o ChatGPT, que responde rápido, que entiende si uno dice una palabra mal, que sabe a lo que uno se refiere».

## Lo que se midió antes de cambiar nada

- Una respuesta de Bria tardaba entre 4 y 10 segundos en total, en 1 a 4 llamadas al modelo de 2 a 5 segundos cada una (`AiUsageEvent`, 9 de octubre de 2026).
- Lo que pesaba no era tanto la duración como que **no se veía nada hasta el final**.

## Qué cambió

1. **Bria escribe en vivo.**
   - El cliente de OpenAI pide la respuesta por partes cuando quien llama pasa `onTextDelta` (`openAIClient.js`, `requestStream`).
   - El bucle de herramientas (`runAssistant`, parámetro `onEvent`) emite tres avisos:
     - `delta`: el texto que va escribiendo;
     - `status`: qué está haciendo, una frase por herramienta en `toolProgressLabel`;
     - `reset`: borra lo escrito. Se emite si el modelo escribió algo y después pidió una herramienta, o si hubo un reintento.
   - La ruta de mensajes los manda al navegador si este pide `Accept: text/event-stream`, y al final manda el chat guardado, **que es el que manda**. Un resumen de pendiente, despacho o acción lo escribe la plataforma y reemplaza lo que se vio en vivo.
   - Un error que llega con el flujo abierto va como evento, en palabras.
2. **El registro de uso conserva los tokens** de una respuesta por partes. `governedFetch` espera el aviso del final (`reportStreamUsage`) y escribe una sola fila. Antes, una respuesta por partes quedaba sin tokens.
3. **Lo fijo de las instrucciones va primero.** La fecha y el nombre de la persona pasaron al final, para que OpenAI reutilice el principio idéntico entre preguntas (caché de prompt).
4. **Nombres mal escritos.** `src/lib/fuzzyMatch.js` compara como una persona: sin tildes ni espacios, tolerando letras cambiadas y aceptando parte del nombre. `buscar_cliente` busca primero la coincidencia exacta y, si no hay, la más parecida («aristia» encuentra Aristea). En ese caso avisa a Bria que fue una aproximación, para que pregunte si hay dudas.

## Lo que no cambia

- Sin `Accept: text/event-stream` la ruta responde el JSON de siempre. Una muestra o prueba que inyecta su propio `request` en `BriaConversation` sigue con la respuesta completa.
- Lo guardado en la conversación es lo mismo de antes.

## Pruebas y muestra

- Contratos: `tests/openAIClientStream.test.js`, `tests/briaStreaming.test.js`, `tests/briaConversationStream.test.js`, `tests/briaChatStream.test.js`, `tests/briaPromptCache.test.js`, `tests/fuzzyMatch.test.js` y el caso de nombre mal escrito en `tests/briaAssistantTools.test.js`.
- Muestra local: `tests/fixtures/bria-stream-preview.html` (`?lento` deja más tiempo el aviso de estado, `&dark`).
