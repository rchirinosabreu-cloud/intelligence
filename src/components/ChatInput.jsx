import { useState } from "react";
import Button from "../ui/button.jsx";

export default function ChatInput({ onSend }) {
  const [value, setValue] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!value.trim()) return;
    onSend(value.trim());
    setValue("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-3">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Escribe tu mensaje..."
        rows={2}
        className="flex-1 resize-none rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
      />
      <Button type="submit">Enviar</Button>
    </form>
  );
}
