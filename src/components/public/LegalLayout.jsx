import React from 'react';
import { Link } from 'react-router-dom';

const LegalLayout = ({ children, title }) => {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
      {/* Minimalist Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="/brainstudio-logo.png" alt="BrainStudio" className="w-8 h-8 object-contain" />
            <span className="font-bold tracking-tighter text-lg">BrainStudio OS</span>
          </Link>
          <div className="text-xs text-zinc-400 uppercase tracking-widest font-medium">
            Legal
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12 md:py-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <h1 className="text-3xl md:text-4xl font-bold mb-8 tracking-tight">{title}</h1>
        <div className="prose prose-zinc dark:prose-invert max-w-none prose-p:text-zinc-600 dark:prose-p:text-zinc-400 prose-headings:text-zinc-900 dark:prose-headings:text-zinc-100">
          {children}
        </div>
      </main>

      {/* Minimalist Footer */}
      <footer className="border-t border-zinc-100 dark:border-zinc-900 py-8 text-center">
        <p className="text-[10px] text-zinc-400 uppercase tracking-widest">
          &copy; {new Date().getFullYear()} BrainStudio Agencia de Crecimiento. Todos los derechos reservados.
        </p>
      </footer>
    </div>
  );
};

export default LegalLayout;
