import ChatMessage from "./ChatMessage.jsx";

export default function ChatHistory({ messages }) {
  if (!messages.length) {
    return (
      <div className="text-center text-sm text-ink/60">
        Inicia una conversación con Brainstudio Intelligence.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.map((message) => (
        <ChatMessage key={message.id} message={message} />
      ))}
    </div>
  );
}
