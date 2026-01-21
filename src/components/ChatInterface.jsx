import { useMemo, useRef, useState } from "react";
import ChatHeader from "./ChatHeader.jsx";
import ChatHistory from "./ChatHistory.jsx";
import ChatInput from "./ChatInput.jsx";
import GreetingMessage from "./GreetingMessage.jsx";
import WelcomeMessage from "./WelcomeMessage.jsx";
import { buildMessage } from "../lib/chatUtils.js";

export default function ChatInterface() {
  const [messages, setMessages] = useState([]);
  const scrollRef = useRef(null);

  const handleSend = (content) => {
    setMessages((prev) => [...prev, buildMessage("user", content)]);
  };

  const history = useMemo(
    () => (messages.length ? messages : []),
    [messages]
  );

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="flex w-full max-w-4xl flex-col gap-6 rounded-xl bg-surface p-6 shadow-chat">
        <ChatHeader />
        <GreetingMessage />
        <div ref={scrollRef} className="chat-scroll max-h-[60vh] overflow-y-auto">
          <ChatHistory messages={history} />
        </div>
        <WelcomeMessage />
        <ChatInput onSend={handleSend} />
      </section>
    </main>
  );
}
