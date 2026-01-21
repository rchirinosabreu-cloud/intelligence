import { SYSTEM_PROMPT } from "./prompt";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

const encoder = new TextEncoder();

const withSystemPrompt = (messages: ChatMessage[]) => [
  { role: "system", content: SYSTEM_PROMPT },
  ...messages,
];

const createReadableStream = (
  streamHandler: (controller: ReadableStreamDefaultController<Uint8Array>) => Promise<void>
) =>
  new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await streamHandler(controller);
      } catch (error) {
        controller.enqueue(encoder.encode("Error en el streaming del modelo."));
      } finally {
        controller.close();
      }
    },
  });

const streamFromSSE = async (
  response: Response,
  onMessage: (data: string) => void
) => {
  if (!response.body) {
    throw new Error("No stream body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const lines = part.split("\n").map((line) => line.trim());
      const dataLines = lines.filter((line) => line.startsWith("data:"));
      if (!dataLines.length) continue;

      const data = dataLines
        .map((line) => line.replace(/^data:\s?/, ""))
        .join("");

      if (data === "[DONE]") {
        return;
      }

      onMessage(data);
    }
  }
};

export const streamOpenAIResponse = async (messages: ChatMessage[]) => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY missing");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: withSystemPrompt(messages),
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error("OpenAI request failed");
  }

  return createReadableStream(async (controller) => {
    await streamFromSSE(response, (payload) => {
      const data = JSON.parse(payload);
      if (data.type === "response.output_text.delta") {
        controller.enqueue(encoder.encode(data.delta));
      }
    });
  });
};

export const streamGeminiResponse = async (messages: ChatMessage[]) => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY missing");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: messages.map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }],
        })),
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      }),
    }
  );

  if (!response.ok) {
    throw new Error("Gemini request failed");
  }

  return createReadableStream(async (controller) => {
    await streamFromSSE(response, (payload) => {
      const data = JSON.parse(payload);
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        controller.enqueue(encoder.encode(text));
      }
    });
  });
};
