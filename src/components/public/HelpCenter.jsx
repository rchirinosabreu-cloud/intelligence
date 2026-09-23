import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Menu, ShieldCheck, X } from '@/components/ui/icons';
import { HELP_UPDATED_AT, findHelpArticle, helpGroups } from '@/content/publicHelpContent';

const initialArticleId = () => {
  if (typeof window === 'undefined') return 'primeros-pasos';
  return window.location.hash.replace('#', '') || 'primeros-pasos';
};

const BulletSection = ({ title, items, ordered = false }) => {
  const List = ordered ? 'ol' : 'ul';
  return (
    <section className="border-t border-zinc-200 pt-6 dark:border-white/10">
      <h2 className="text-lg font-bold text-zinc-950 dark:text-white">{title}</h2>
      <List className={`${ordered ? 'list-decimal' : 'list-disc'} mt-3 space-y-2 pl-5 text-sm leading-6 text-zinc-600 marker:font-semibold marker:text-brand-cyan-deep dark:text-zinc-300 dark:marker:text-brand-cyan`}>
        {items.map((item) => <li key={item}>{item}</li>)}
      </List>
    </section>
  );
};

const HelpCenter = () => {
  const [activeId, setActiveId] = useState(initialArticleId);
  const [menuOpen, setMenuOpen] = useState(false);
  const activeArticle = useMemo(() => findHelpArticle(activeId), [activeId]);

  const selectArticle = (id) => {
    setActiveId(id);
    setMenuOpen(false);
    window.history.replaceState(null, '', `#${id}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigation = (
    <nav aria-label="Capítulos de la guía" className="space-y-7">
      {helpGroups.map((group) => (
        <section key={group.id}>
          <h2 className="px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">{group.label}</h2>
          <div className="mt-2 space-y-1">
            {group.articles.map((article) => (
              <button key={article.id} type="button" onClick={() => selectArticle(article.id)} aria-current={activeArticle.id === article.id ? 'page' : undefined}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${activeArticle.id === article.id
                  ? 'bg-brand-cyan/10 font-semibold text-brand-cyan-deep dark:bg-brand-cyan/15 dark:text-brand-cyan'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white'}`}>
                {article.title}
              </button>
            ))}
          </div>
        </section>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/90">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/brainstudio-logo.png" alt="BrainStudio" className="h-8 w-8 object-contain" />
            <span className="font-bold tracking-tight">BrainStudio OS</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/seguridad" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white sm:inline-flex">Seguridad</Link>
            <button type="button" onClick={() => setMenuOpen(true)} aria-label="Abrir índice" className="grid h-11 w-11 place-items-center rounded-lg border border-zinc-200 text-zinc-600 dark:border-white/10 dark:text-zinc-300 lg:hidden"><Menu className="h-5 w-5" /></button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="hidden min-h-[calc(100vh-4rem)] border-r border-zinc-200 bg-zinc-100/70 px-5 py-10 dark:border-white/10 dark:bg-zinc-900/40 lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-1">
            <p className="text-xl font-bold text-brand-cyan-deep dark:text-brand-cyan">Ayuda</p>
            <p className="mt-1 text-xs leading-5 text-zinc-400">BrainStudio OS · actualizado {HELP_UPDATED_AT}</p>
            <div className="mt-8">{navigation}</div>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-10 sm:px-8 lg:px-12 lg:py-14 xl:px-16">
          <div className="mx-auto max-w-4xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-cyan-deep dark:text-brand-cyan">{activeArticle.groupLabel}</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-zinc-950 dark:text-white sm:text-4xl">Guía de uso</h1>
            <p className="mt-3 text-base leading-7 text-zinc-500 dark:text-zinc-400">Aprende cómo funciona cada módulo y cómo registrar el trabajo con claridad, seguridad y trazabilidad.</p>

            <article className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900 sm:p-8">
              <h2 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">{activeArticle.title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{activeArticle.summary}</p>

              <div className="mt-6 rounded-2xl border border-brand-cyan/25 bg-brand-cyan/5 p-5">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-cyan-deep dark:text-brand-cyan">Para qué sirve</p>
                <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-200">{activeArticle.purpose}</p>
              </div>

              <div className="mt-5 flex gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-5 dark:border-white/10 dark:bg-zinc-950/60">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-green-deep dark:text-brand-green" />
                <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">Quién puede usarlo</p><p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-200">{activeArticle.access}</p></div>
              </div>

              <div className="mt-7 space-y-7">
                <BulletSection title="Funciones principales" items={activeArticle.functions} />
                <BulletSection title="Procedimiento básico" items={activeArticle.steps} ordered />
                <BulletSection title="Buenas prácticas" items={activeArticle.practices} />
              </div>

              <div className="mt-8 flex gap-3 rounded-2xl border border-brand-green/25 bg-brand-green/10 p-5">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-green-deep dark:text-brand-green" />
                <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-200"><strong>Regla general:</strong> espera la confirmación del sistema antes de cerrar un formulario o considerar terminada una acción.</p>
              </div>
            </article>

            <p className="mt-8 text-center text-xs leading-5 text-zinc-400">Esta guía describe el uso general. Las funciones visibles dependen del rol y los permisos de cada persona.</p>
          </div>
        </main>
      </div>

      {menuOpen && <div className="fixed inset-0 z-[80] lg:hidden">
        <button type="button" aria-label="Cerrar índice" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-zinc-950/45 backdrop-blur-sm" />
        <aside className="absolute inset-y-0 left-0 w-[min(88vw,22rem)] overflow-y-auto border-r border-zinc-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-zinc-950">
          <div className="flex items-center justify-between"><p className="text-lg font-bold">Índice de ayuda</p><button type="button" onClick={() => setMenuOpen(false)} aria-label="Cerrar índice" className="grid h-11 w-11 place-items-center rounded-lg hover:bg-zinc-100 dark:hover:bg-white/5"><X className="h-5 w-5" /></button></div>
          <div className="mt-7">{navigation}</div>
        </aside>
      </div>}
    </div>
  );
};

export default HelpCenter;
