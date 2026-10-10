import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import BriaAccessCards from '@/components/bria/BriaAccessCards';
import BriaAccessCapture from '@/components/bria/BriaAccessCapture';
import '@/index.css';

// Muestra local de la bóveda dentro del chat de Bria, con datos ficticios y una API simulada en el navegador.
// Sin parámetros: Bria entrega una contraseña. `?guardar`: Bria prepara guardar una. `&dark` modo oscuro.
const params = new URLSearchParams(location.search);
localStorage.setItem('authToken', 'demo');
document.documentElement.classList.toggle('dark', params.has('dark'));
document.body.className = params.has('dark') ? 'bg-zinc-950' : 'bg-zinc-50';

const saved = [];
const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const realFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
  if (url.pathname === '/api/vault/credentials' && init.method === 'POST') { saved.push(JSON.parse(init.body).platform); return json({ created: true }); }
  if (/^\/api\/vault\/credentials\/capcut\/reveal$/.test(url.pathname)) return json({ username: 'equipo@ejemplo.test', secret: 'Clave-de-ejemplo-456', url: 'https://www.capcut.com/login', notes: 'Otro usuario anotado en «Accesos Brain»: diseno@ejemplo.test', kind: 'ACCESO' });
  if (/^\/api\/vault\/credentials\/\w+\/reveal$/.test(url.pathname)) return json({ username: 'soporte@ejemplo.test', secret: 'Clave-de-ejemplo-123', notes: 'El código de verificación llega al celular de la PM.', kind: 'ACCESO' });
  return realFetch(input, init);
};

const Bubble = ({ children }) => <div className="ml-auto max-w-[90%] rounded-2xl rounded-br-md bg-brand-cyan-soft px-4 py-3 text-sm text-brand-cyan-deep dark:bg-brand-cyan/15 dark:text-zinc-100">{children}</div>;
const Answer = ({ children }) => <div className="prose prose-sm max-w-none text-zinc-800 dark:prose-invert dark:text-zinc-100">{children}</div>;

function Preview() {
  const [sent, setSent] = React.useState(null);
  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
      {params.has('guardar') ? <>
        <Bubble>Quiero guardar la contraseña del correo de soporte de Cliente de ejemplo, el usuario es soporte@ejemplo.test</Bubble>
        <div><Answer><p>Listo. Lo guardo como <strong>Correo de soporte</strong> (Gmail) de Cliente de ejemplo, con el usuario soporte@ejemplo.test. Escribe la contraseña en el campo protegido de abajo: va directo a la bóveda y yo no la veo.</p></Answer>
          <BriaAccessCapture active={!sent} onSaved={setSent} capture={{ captureId: 'k1', mode: 'NEW', clientId: 'c1', clientName: 'Cliente de ejemplo', platform: 'Gmail', label: 'Correo de soporte', username: 'soporte@ejemplo.test' }} /></div>
        {sent && <Bubble>{sent}</Bubble>}
      </> : params.has('capcut') ? <>
        <Bubble>Dame la contraseña del capcut, por fa</Bubble>
        <div><Answer><p>Aquí está el acceso de <strong>CapCut</strong> de Brain Studio. Se oculta en un minuto.</p></Answer>
          <BriaAccessCards fresh cards={[{ id: 'capcut', cliente: 'Brain Studio', plataforma: 'CapCut', nombre: 'CapCut' }]} /></div>
      </> : <>
        <Bubble>Dame la contraseña del correo de soporte de Cliente de ejemplo</Bubble>
        <div><Answer><p>Aquí está el acceso del <strong>Correo de soporte</strong> de Cliente de ejemplo. Se oculta en un minuto.</p></Answer>
          <BriaAccessCards fresh cards={[{ id: 'a1', cliente: 'Cliente de ejemplo', plataforma: 'Gmail', nombre: 'Correo de soporte' }]} /></div>
      </>}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<><Preview /><Toaster /></>);
