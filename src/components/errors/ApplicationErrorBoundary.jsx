import React from 'react';
import { AlertTriangle, RefreshCw } from '@/components/ui/icons';

class ApplicationErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ApplicationErrorBoundary] Error no controlado en la interfaz.', {
      error,
      errorInfo
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main
        className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:px-6"
        role="alert"
      >
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle aria-hidden="true" className="size-6" />
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-tight sm:text-2xl">
            No pudimos cargar esta sección
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-base">
            La aplicación pudo haberse actualizado mientras estaba abierta. Actualiza para cargar la versión más reciente.
          </p>
          <button
            className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:bg-violet-500 dark:hover:bg-violet-400 dark:focus-visible:ring-offset-slate-900 sm:w-auto"
            onClick={this.handleReload}
            type="button"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            Actualizar aplicación
          </button>
        </section>
      </main>
    );
  }
}

export default ApplicationErrorBoundary;
