// Disposable local DB and in-memory objects. Uses the real production headers and a built fixture.
import { build } from 'vite';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { createChatSandbox } from '../tests/helpers/teamChatSandbox.js';
import { securityHeaders } from '../src/config/security.js';
await build({build:{outDir:'output/team-chat/audio-build',emptyOutDir:false,copyPublicDir:false,target:'esnext',rollupOptions:{input:'tests/fixtures/team-chat-audio.html'}}});
const sandbox = await createChatSandbox();
await sandbox.runtime.service.sendMessage(sandbox.actors[1], 'general', {
  requestId:randomUUID(),content:'<p>Podemos responder y reaccionar a cada mensaje.</p>',
});
const app=express();
app.use(securityHeaders);
app.use(sandbox.app);
app.use(express.static('output/team-chat/audio-build'));
const server=app.listen(4320,'127.0.0.1',()=>console.log('Audio fixture with production headers: http://127.0.0.1:4320/tests/fixtures/team-chat-audio.html'));
const close=async()=>{server.closeAllConnections();server.close();await sandbox.close();process.exit(0);};
process.on('SIGINT',close);process.on('SIGTERM',close);
