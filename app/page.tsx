"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const SPLASH_DURATION_MS = 1700;

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const conversationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop =
        conversationRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const nextMessages = [...messages, { role: "user", content: input }];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!response.ok || !response.body) {
        throw new Error("No response from server");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        assistantMessage += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: assistantMessage,
          };
          return updated;
        });
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Hubo un problema conectando con el modelo. Revisa la configuración.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className={`splash ${showSplash ? "" : "hidden"}`}>
        <Image
          src="/brainstudio-logo.svg"
          alt="Brainstudio Intelligence"
          width={120}
          height={120}
          priority
        />
        <h1>Brainstudio Intelligence</h1>
      </div>
      <main>
        <section className="chat-shell">
          <header className="chat-header">
            <Image
              src="/brainstudio-logo.svg"
              alt="Brainstudio"
              width={28}
              height={28}
            />
            <span>Brainstudio Intelligence</span>
          </header>
          <div className="conversation" ref={conversationRef}>
            {messages.length === 0 ? (
              <div className="empty-state">
                Comienza la conversación con Brainstudio Intelligence.
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`message ${message.role}`}
                >
                  {message.content}
                </div>
              ))
            )}
          </div>
          <div className="input-row">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Escribe tu mensaje..."
              disabled={isLoading}
            />
            <button onClick={sendMessage} disabled={isLoading}>
              {isLoading ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </section>
      </main>
    </>
  );
}
