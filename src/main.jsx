import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import '@/index.css';
import axios from 'axios';

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
        if (urlStr && !urlStr.includes('/api/login')) {
            console.warn(`[Auth] 401 Unauthorized on ${urlStr}. Triggering logout event.`);
            localStorage.removeItem('authToken');
            localStorage.removeItem('currentUser');
            window.dispatchEvent(new Event('auth-error'));
        }
    }

    return response;
};

// React.StrictMode disabled to prevent drag and drop issues in development
ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
);
