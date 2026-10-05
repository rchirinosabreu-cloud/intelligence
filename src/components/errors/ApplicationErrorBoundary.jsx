import React from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, Loader2, RefreshCw } from '@/components/ui/icons';
import { isChunkLoadError } from '@/lib/appErrors';
import { reportClientError } from '@/lib/clientErrorReporter';
import { attemptBrowserVersionRecovery } from '@/pwa/preloadRecovery';
import { cn } from '@/lib/utils';

/**
 * Lo que se ve cuando una pantalla falla (Rodny, 5 de octubre de 2026). A Elisa le salía «No
 * pudimos cargar esta sección» cada vez que entraba: eran archivos de una versión anterior,
 * borrados por un despliegue, y el mismo texto tapaba también cualquier error real sin dejar
 * rastro. Ahora hay tres casos distintos:
 *  - Versión nueva: se recarga sola y mientras tanto se ve «cargando», nunca el error.
 *  - Versión nueva que no se recuperó recargando: lo dice tal cual y ofrece actualizar.
 *  - Error real: lo dice, queda registrado en el servidor y muestra una referencia para buscarlo.
 * `scope="page"` es la versión dentro del diseño: el menú y el header siguen en pie.
 */
class ApplicationErrorBoundary extends React.Component {
  state = { error: null, reference: null, recovering: false };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ApplicationErrorBoundary] Error no controlado en la interfaz.', { error, errorInfo });
    const componentStack = errorInfo?.componentStack;
    if (isChunkLoadError(error)) {
      const recovering = attemptBrowserVersionRecovery(() => reportClientError({ kind: 'version-reload', error, componentStack }));
      if (recovering) {
        this.setState({ recovering: true });
        return;
      }
      this.setState({ reference: reportClientError({ kind: 'version-stale', error, componentStack }) });
      return;
    }
    this.setState({ reference: reportClientError({ kind: 'render', error, componentStack }) });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleRetry = () => {
    this.setState({ error: null, reference: null, recovering: false });
  };

  handleHome = () => {
    window.location.assign('/');
  };

  render() {
    const { error, reference, recovering } = this.state;
    if (!error) return this.props.children;
    const isPage = this.props.scope === 'page';
    const isVersion = isChunkLoadError(error);

    const frame = (content) => (
      <div
        className={cn(
          'flex items-center justify-center text-zinc-900 dark:text-zinc-50',
          isPage ? 'min-h-[50vh] py-10' : 'min-h-screen bg-zinc-50 px-4 py-10 dark:bg-zinc-950 sm:px-6'
        )}
        role={recovering || (isVersion && !reference) ? 'status' : 'alert'}
      >
        {content}
      </div>
    );

    // Mientras se recarga (o se decide si recargar), «cargando»: el error no llega a verse.
    if (isVersion && (recovering || !reference)) {
      return frame(
        <p className="flex items-center gap-2 text-sm font-medium text-zinc-600 dark:text-zinc-300">
          <Loader2 className="h-4 w-4 animate-spin text-brand-cyan-deep dark:text-brand-cyan" aria-hidden="true" />
          Cargando la versión más reciente…
        </p>
      );
    }

    return frame(
      <section className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-white/10 dark:bg-zinc-900 sm:p-8">
        <div className={cn(
          'mx-auto flex size-12 items-center justify-center rounded-full',
          isVersion ? 'bg-brand-cyan/10 text-brand-cyan-deep dark:text-brand-cyan' : 'bg-destructive/10 text-destructive'
        )}>
          {isVersion ? <RefreshCw aria-hidden="true" className="size-6" /> : <AlertTriangle aria-hidden="true" className="size-6" />}
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">
          {isVersion ? 'Hay una versión nueva de la plataforma' : 'Algo falló en esta pantalla'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          {isVersion
            ? 'Se publicó una actualización mientras tenías esta página abierta. Actualiza para seguir donde ibas.'
            : 'Ya quedó registrado para revisarlo. Puedes volver a intentar o seguir en otra sección.'}
        </p>
        {!isVersion && reference && (
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400" data-error-reference>
            Referencia: <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-200">{reference}</span>
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {isVersion ? (
            <button type="button" onClick={this.handleReload}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <RefreshCw aria-hidden="true" className="size-4" />
              Actualizar
            </button>
          ) : (
            <>
              <button type="button" onClick={this.handleRetry}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Volver a intentar
              </button>
              <button type="button" onClick={this.handleHome}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5">
                Ir al inicio
              </button>
            </>
          )}
        </div>
      </section>
    );
  }
}

/** La protección de cada pantalla dentro del diseño; al cambiar de ruta empieza de nuevo. */
export function RouteErrorBoundary({ children }) {
  const location = useLocation();
  return <ApplicationErrorBoundary key={location.pathname} scope="page">{children}</ApplicationErrorBoundary>;
}

export default ApplicationErrorBoundary;
