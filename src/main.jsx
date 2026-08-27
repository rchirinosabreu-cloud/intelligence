import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import 'react-datepicker/dist/react-datepicker.css';
import '@/index.css';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { isTrustedApiRequest } from '@/lib/trustedRequest';
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog';
import { registerBrainstudioServiceWorker } from '@/pwa/registerServiceWorker';

const apiBaseUrl = getApiBaseUrl();
const pageOrigin = window.location.origin;

// Global Axios Interceptor
axios.interceptors.request.use((config) => {
    let target = config.url;
    if (config.baseURL) {
        try {
            target = new URL(config.url || '', config.baseURL).href;
        } catch {
            target = config.url;
        }
    }
    const isTrusted = isTrustedApiRequest(target, apiBaseUrl, pageOrigin);
    const token = localStorage.getItem('authToken');
    if (token && isTrusted) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    config.withCredentials = isTrusted;
    return config;
}, (error) => Promise.reject(error));

// Global Axios Response Interceptor to handle session expiration
axios.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error.response ? error.response.status : null;
        const errorData = error.response ? error.response.data : null;

        // Handle auth/session responses globally
        if (status === 401 || status === 403 || status === 428) {
            const url = error.config ? error.config.url : '';
            const isTrusted = isTrustedApiRequest(url, apiBaseUrl, pageOrigin);

            // Skip global logout/error handling for specific routes (auth and external proxies like Gemini)
            const isAuthRoute = url.includes('/api/login');
            const isGeminiRoute = url.includes('/api/gemini');

            if (isTrusted && !isAuthRoute && !isGeminiRoute) {
                if (status === 401 || errorData?.code === 'TokenExpiredError' || errorData?.message === 'TokenExpiredError') {
                    console.warn(`[Axios] 401 Unauthorized or Token Expired on ${url}. Triggering logout.`);
                    localStorage.removeItem('authToken');
                    localStorage.removeItem('currentUser');
                    sessionStorage.removeItem('authToken');
                    sessionStorage.removeItem('currentUser');
                    window.dispatchEvent(new Event('auth-error'));

                    if (!window.location.pathname.includes('/login')) {
                        window.location.href = '/login?expired=true';
                    }
                } else if (status === 428 || errorData?.code === 'PASSWORD_CHANGE_REQUIRED') {
                    window.dispatchEvent(new Event('password-change-required'));
                    if (!window.location.pathname.includes('/cambiar-password')) {
                        window.location.href = '/cambiar-password';
                    }
                } else if (status === 403) {
                    console.warn(`[Axios] 403 Forbidden on ${url}. Triggering toast event.`);
                    window.dispatchEvent(new Event('auth-forbidden'));
                }
            }
        }

        return Promise.reject(error);
    }
);

// Global Fetch Interceptor for requests sent to the Brainstudio API.
const originalFetch = window.fetch;
window.fetch = async (...args) => {
    let [resource, config] = args;
    config = config ? { ...config } : {};
    const isTrusted = isTrustedApiRequest(resource, apiBaseUrl, pageOrigin);
    const token = localStorage.getItem('authToken');

    if (isTrusted) {
        const sourceHeaders = resource instanceof Request ? resource.headers : config.headers;
        const headers = new Headers(sourceHeaders || {});
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }
        config.headers = headers;
        config.credentials = config.credentials || 'include';
        if (resource instanceof Request) {
            resource = new Request(resource, config);
            config = undefined;
        }
    }

    const response = await originalFetch(resource, config);

    // Handle 401/403 Unauthorized globally
    if (response.status === 401 || response.status === 403 || response.status === 428) {
        const urlStr = typeof resource === 'string' ? resource : resource?.url;

        // Skip global logout/error handling for specific routes (auth and external proxies like Gemini)
        const isAuthRoute = urlStr?.includes('/api/login');
        const isGeminiRoute = urlStr?.includes('/api/gemini');

        if (isTrusted && urlStr && !isAuthRoute && !isGeminiRoute) {
            if (response.status === 401) {
                console.warn(`[Auth] 401 Unauthorized on ${urlStr}. Triggering logout event.`);
                localStorage.removeItem('authToken');
                localStorage.removeItem('currentUser');
                sessionStorage.removeItem('authToken');
                sessionStorage.removeItem('currentUser');
                window.dispatchEvent(new Event('auth-error'));

                // Optional: Redirect to login if on a protected route and NOT already on login page
                if (!window.location.pathname.includes('/login')) {
                    window.location.href = '/login?expired=true';
                }
            } else if (response.status === 428) {
                window.dispatchEvent(new Event('password-change-required'));
                if (!window.location.pathname.includes('/cambiar-password')) {
                    window.location.href = '/cambiar-password';
                }
            } else if (response.status === 403) {
                console.warn(`[Auth] 403 Forbidden on ${urlStr}. Triggering toast event.`);
                window.dispatchEvent(new Event('auth-forbidden'));
            }
        } else if (isGeminiRoute) {
            console.log(`[Auth] ${response.status} status on Gemini proxy ignored for global logout.`);
            if (response.status >= 400) {
                window.dispatchEvent(new Event('ai-error'));
            }
        }
    }

    return response;
};

// React.StrictMode disabled to prevent drag and drop issues in development
ReactDOM.createRoot(document.getElementById('root')).render(
  <ConfirmDialogProvider>
    <App />
  </ConfirmDialogProvider>
);

registerBrainstudioServiceWorker();
