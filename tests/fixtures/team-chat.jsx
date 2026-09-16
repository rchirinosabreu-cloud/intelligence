import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import TeamChat from "../../src/components/chat/TeamChat";
import { createTeamChatClient } from "../../src/lib/teamChatClient";
import "../../src/index.css";
const actor =
  new URLSearchParams(location.search).get("actor") === "luis"
    ? { id: "demo-luis", name: "Luis · Prueba local", role: "EDITOR" }
    : { id: "demo-ana", name: "Ana · Prueba local", role: "ADMIN" };
const client = createTeamChatClient("", () => actor.id);
function Fixture() {
  const [width, setWidth] = useState(0),
    [dark, setDark] = useState(false),
    [module, setModule] = useState("Gestión");
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 flex h-16 items-center gap-4 border-b border-border bg-background px-5">
        <b>Brainstudio</b>
        <span className="text-xs text-muted-foreground">
          Prueba local aislada · {actor.name}
        </span>
        <button
          className="ml-auto min-h-11 px-3 text-sm"
          onClick={() => {
            setDark(!dark);
            document.documentElement.classList.toggle("dark", !dark);
          }}
        >
          Cambiar tema
        </button>
      </header>
      <main
        style={{ marginRight: width, paddingTop: 96 }}
        className="px-6 pb-6"
      >
        <h1 className="text-2xl font-semibold">{module}</h1>
        <p className="my-2 text-muted-foreground">
          Tu espacio de trabajo sigue disponible mientras conversas.
        </p>
        <div className="my-6 flex gap-3">
          {["Gestión", "Actividad", "Clientes"].map((x) => (
            <button
              className="min-h-11 rounded-lg border border-border px-4"
              key={x}
              onClick={() => setModule(x)}
            >
              {x}
            </button>
          ))}
        </div>
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}
        >
          {["Hoy + Vencidos", "En proceso", "Listo para revisar"].map((x) => (
            <section
              key={x}
              className="min-h-64 rounded-xl border border-border bg-card p-5"
            >
              <h2 className="font-semibold">{x}</h2>
              <p className="mt-4 text-sm text-muted-foreground">
                Datos de ejemplo. Esta prueba no escribe en producción.
              </p>
            </section>
          ))}
        </div>
      </main>
      <TeamChat
        currentUser={actor}
        client={client}
        onDockWidthChange={setWidth}
      />
    </div>
  );
}
const root = createRoot(document.getElementById("root"));
root.render(<Fixture />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
