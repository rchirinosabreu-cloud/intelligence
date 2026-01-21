import { NextRequest } from "next/server";
import { streamGeminiResponse, streamOpenAIResponse } from "@/lib/ai/providers";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const messages = (body?.messages ?? []) as ChatMessage[];
  const provider = process.env.PROVIDER ?? "openai";

  try {
    const stream =
      provider === "gemini"
        ? await streamGeminiResponse(messages)
        : await streamOpenAIResponse(messages);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    return new Response("Error en la conexión con el proveedor.", {
      status: 500,
    });
  }
}
