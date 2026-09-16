// This preview creates disposable fixtures exclusively in the validated local test database.
import { createServer } from "vite";
import { createChatSandbox } from "../tests/helpers/teamChatSandbox.js";
import { randomUUID } from "node:crypto";
const sandbox = await createChatSandbox();
await sandbox.runtime.service.sendMessage(sandbox.actors[1], "general", {
  requestId: randomUUID(),
  content:
    "<p>¡Hola, equipo! Aquí podemos compartir ideas, archivos y notas de voz.</p>",
});
await sandbox.runtime.service.sendMessage(sandbox.actors[0], "general", {
  requestId: randomUUID(),
  content:
    "<p><strong>Todo en un mismo lugar.</strong> También puedes <u>resaltar</u> lo importante, responder y reaccionar.</p>",
});
const vite = await createServer({
  server: { middlewareMode: true },
  appType: "mpa",
});
sandbox.app.use(vite.middlewares);
const server = sandbox.app.listen(4318, "127.0.0.1", () =>
  console.log(
    "Local isolated chat: http://127.0.0.1:4318/tests/fixtures/team-chat.html",
  ),
);
const close = async () => {
  server.closeAllConnections();
  server.close();
  await vite.close();
  await sandbox.close();
  process.exit(0);
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
