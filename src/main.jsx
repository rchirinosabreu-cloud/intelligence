import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import '@/index.css';
import axios from 'axios';

// Initialize Meta SDK
// We use VITE_ prefix for Vite environment variables.
// Fallback to the provided App ID (947130437684926) if env var is not set.
const META_APP_ID = import.meta.env.VITE_META_APP_ID || '947130437684926';

if (typeof window !== 'undefined' && META_APP_ID) {
  window.fbAsyncInit = function() {
    console.log(`[Meta SDK] Initializing with App ID: ${META_APP_ID}`);
    window.FB.init({
      appId      : META_APP_ID,
      cookie     : true,
      xfbml      : true,
      version    : 'v21.0'
    });
  };

  (function(d, s, id) {
    var js, fjs = d.getElementsByTagName(s)[0];
    if (d.getElementById(id)) return;
    js = d.createElement(s); js.id = id;
    js.src = "https://connect.facebook.net/es_LA/sdk.js";
    fjs.parentNode.insertBefore(js, fjs);
  }(document, 'script', 'facebook-jssdk'));
} else {
  console.warn('[Meta SDK] App ID missing. SDK will not be initialized.');
}

// Global Axios Interceptor
axios.interceptors.request.use((config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    config.withCredentials = true;
    return config;
}, (error) => Promise.reject(error));

// Global Fetch Interceptor to inject JWT Auth Token into every request
const originalFetch = window.fetch;
window.fetch = async (...args) => {
    let [resource, config] = args;

    // Ensure credentials are included (important for cross-subdomain/domain support)
    if (!config) config = {};
    config.credentials = config.credentials || 'include';

    const token = localStorage.getItem('authToken');

    if (resource instanceof Request) {
        // If a Request object is passed, we must modify its headers directly.
        // Note: some browsers might require cloning if the request is already used.
        if (token) {
            resource.headers.set('Authorization', `Bearer ${token}`);
        }
    } else {
        // If resource is a URL string, we modify the config object.
        if (token) {
            // Ensure headers is a Headers object for easier manipulation
            if (!(config.headers instanceof Headers)) {
                config.headers = new Headers(config.headers || {});
            }
            config.headers.set('Authorization', `Bearer ${token}`);
        }
    }

    const response = await originalFetch(resource, config);

    // Handle 401/403 Unauthorized globally
    if (response.status === 401 || response.status === 403) {
        const urlStr = typeof resource === 'string' ? resource : resource?.url;

        // Skip global logout/error handling for specific routes (auth and external proxies like Gemini)
        const isAuthRoute = urlStr?.includes('/api/login');
        const isGeminiRoute = urlStr?.includes('/api/gemini');

        if (urlStr && !isAuthRoute && !isGeminiRoute) {
            if (response.status === 401) {
                console.warn(`[Auth] 401 Unauthorized on ${urlStr}. Triggering logout event.`);
                localStorage.removeItem('authToken');
                localStorage.removeItem('currentUser');
                window.dispatchEvent(new Event('auth-error'));

                // Optional: Redirect to login if on a protected route
                if (!window.location.pathname.startsWith('/login')) {
                    window.location.href = '/login';
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
  <App />
);
