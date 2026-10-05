import { getApiBaseUrl } from './apiBaseUrl.js';
import { newErrorReference } from './appErrors.js';

// Manda al servidor lo que vio la persona cuando una pantalla falló (5 de octubre de 2026). Antes
// el motivo solo quedaba en la consola de su navegador y no había forma de saber qué le pasó a
// Elisa. Nunca lanza: registrar un error no puede causar otro. `keepalive` deja que el aviso
// salga aunque la página se esté recargando.

const getBuildVersion = () => (typeof __BUILD_SHA__ === 'undefined' ? 'development' : __BUILD_SHA__);

export const reportClientError = ({ kind = 'render', error, componentStack, reference = newErrorReference() } = {}) => {
    try {
        if (typeof window === 'undefined' || typeof fetch !== 'function') return reference;
        const token = window.localStorage?.getItem('authToken');
        if (!token) return reference;
        const body = {
            kind,
            reference,
            message: String(error?.message || error || 'Error sin mensaje'),
            stack: error?.stack || null,
            componentStack: componentStack || null,
            route: `${window.location?.pathname || ''}${window.location?.search || ''}`,
            build: getBuildVersion(),
            userAgent: window.navigator?.userAgent || null
        };
        fetch(`${getApiBaseUrl()}/api/client-errors`, {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(body)
        }).catch((requestError) => console.error('[ClientErrorReporter] No se pudo registrar el error:', requestError?.message || requestError));
    } catch (reportError) {
        console.error('[ClientErrorReporter] No se pudo preparar el registro del error:', reportError);
    }
    return reference;
};
