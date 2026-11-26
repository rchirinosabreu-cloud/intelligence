import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, CheckCircle, FileBarChart, LayoutGrid, ShieldCheck, Sparkles } from '@/components/ui/icons';
import { FacebookLogo, InstagramLogo, LinkedinLogo, TiktokLogo } from '@/components/ui/SocialBrandLogos';
import { LEGAL_ENTITY as E } from './legalEntity';

// Presentación pública del producto (Rodny, 25 de noviembre de 2026). La dirección principal solo
// mostraba el inicio de sesión, y quien revisa la plataforma desde fuera (las redes que aprueban la
// publicación, una agencia interesada) no podía saber qué es. Va debajo del inicio de sesión, que
// no se mueve: el equipo entra igual que siempre.
//
// Solo afirma lo que la plataforma hace hoy. Una red nueva se añade aquí cuando ya publica.

const FEATURES = [
  { icon: LayoutGrid, title: 'Parrillas de contenido', text: 'El equipo planea el mes de cada marca, pieza por pieza, con su texto, su formato y su fecha.' },
  { icon: CheckCircle, title: 'Aprobación del cliente', text: 'El cliente revisa y aprueba cada pieza desde un enlace, sin crear una cuenta, y sus cambios quedan registrados.' },
  { icon: CalendarClock, title: 'Publicación programada', text: 'Las piezas aprobadas salen a la hora elegida en las cuentas que la marca conectó, y la plataforma confirma el resultado.' },
  { icon: FileBarChart, title: 'Reportes de resultados', text: 'Las cifras de las cuentas y de las campañas se reúnen en un informe mensual para cada cliente.' },
  { icon: Sparkles, title: 'Bria, asistente con IA', text: 'Revisa las piezas antes de enviarlas, resume reuniones y acompaña al equipo. Propone; las personas deciden.' },
  { icon: ShieldCheck, title: 'Acceso y trazabilidad', text: 'Cuentas personales con verificación en dos pasos, permisos por rol y registro de cada acción.' }
];

const NETWORKS = [
  { Logo: InstagramLogo, name: 'Instagram' },
  { Logo: FacebookLogo, name: 'Facebook' },
  { Logo: LinkedinLogo, name: 'LinkedIn' },
  { Logo: TiktokLogo, name: 'TikTok' }
];

const CONNECTION_FACTS = [
  'Cada cuenta la autoriza su dueño o su administrador en la pantalla oficial de la red. La plataforma nunca pide ni guarda la contraseña de la red.',
  'Solo se publican piezas que una persona aprobó y programó. Nada sale por decisión automática.',
  'La plataforma no lee mensajes privados, comentarios ni listas de seguidores. De cada cuenta consulta estadísticas agregadas para los reportes.',
  'Una cuenta se desconecta en cualquier momento desde la plataforma o desde la propia red, y lo programado en ella se cancela.'
];

const linkClass = 'font-medium text-brand-cyan-deep underline underline-offset-4 dark:text-brand-cyan';

const ProductOverview = () => (
  <section id="producto" aria-labelledby="producto-titulo" className="border-t border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40">
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      <p className="text-sm font-semibold text-brand-cyan-deep dark:text-brand-cyan">{E.platform}</p>
      <h2 id="producto-titulo" className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl dark:text-white">
        La plataforma con la que una agencia planea, aprueba y publica el contenido de sus marcas
      </h2>
      <p className="mt-5 max-w-3xl text-base leading-7 text-zinc-600 dark:text-zinc-300">
        {E.platform} reúne en un solo lugar el trabajo de una agencia de marketing: las parrillas de contenido, la aprobación del cliente, la publicación en redes sociales y los reportes. Está pensada para agencias y equipos de comunicación que manejan varias marcas, y para las marcas que les confían sus cuentas.
      </p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <li key={title} className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <Icon className="h-5 w-5 text-brand-cyan-deep dark:text-brand-cyan" aria-hidden="true" />
            <h3 className="mt-4 text-base font-bold text-zinc-950 dark:text-white">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{text}</p>
          </li>
        ))}
      </ul>

      <div className="mt-12 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="min-w-0">
          <h3 className="text-xl font-bold text-zinc-950 dark:text-white">Redes donde publica</h3>
          <ul className="mt-5 flex flex-wrap gap-3">
            {NETWORKS.map(({ Logo, name }) => (
              <li key={name} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
                <Logo className="h-5 w-5" />
                {name}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Imágenes, carruseles y videos, con el texto de la publicación y la fecha que el equipo y el cliente acordaron.
          </p>
        </div>

        <div className="min-w-0">
          <h3 className="text-xl font-bold text-zinc-950 dark:text-white">Cómo se conecta una cuenta y qué hace la plataforma con ella</h3>
          <ul className="mt-5 space-y-3">
            {CONNECTION_FACTS.map((fact) => (
              <li key={fact} className="flex gap-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-green-deep dark:text-brand-green" aria-hidden="true" />
                <span className="min-w-0">{fact}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            El detalle está en la <Link to="/privacidad" className={linkClass}>política de tratamiento de datos</Link> y en los <Link to="/terminos" className={linkClass}>términos de uso</Link>.
          </p>
        </div>
      </div>

      <div className="mt-12 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-xl font-bold text-zinc-950 dark:text-white">¿Quieres usarla en tu agencia?</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Escríbenos a <a href={`mailto:${E.email}`} className={linkClass}>{E.email}</a> o llama al <a href={E.phoneHref} className={linkClass}>{E.phone}</a> y te mostramos la plataforma. El acceso es con cuenta personal, que crea el administrador de cada agencia.
        </p>
      </div>
    </div>

    <footer className="border-t border-zinc-200 px-4 py-8 text-center sm:px-6 dark:border-zinc-800">
      <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        &copy; {new Date().getFullYear()} {E.name} · NIT {E.nit} · {E.address}
      </p>
      <nav className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-zinc-500 dark:text-zinc-400" aria-label="Páginas públicas">
        <Link to="/privacidad" className="hover:text-zinc-900 dark:hover:text-zinc-100">Privacidad</Link>
        <Link to="/terminos" className="hover:text-zinc-900 dark:hover:text-zinc-100">Términos</Link>
        <Link to="/seguridad" className="hover:text-zinc-900 dark:hover:text-zinc-100">Seguridad e IA</Link>
        <Link to="/ayuda" className="hover:text-zinc-900 dark:hover:text-zinc-100">Ayuda</Link>
      </nav>
    </footer>
  </section>
);

export default ProductOverview;
