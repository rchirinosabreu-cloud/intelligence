import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import '@/index.css';

// Global Fetch Interceptor to inject JWT Auth Token into every request
const originalFetch = window.fetch;
window.fetch = async (...args) => {
    let [resource, config] = args;

    if (!config) {
        config = {};
    }
    if (!config.headers) {
        config.headers = {};
    }

    // Inject token if present
    const token = localStorage.getItem('authToken');
    if (token) {
        if (config.headers instanceof Headers) {
            config.headers.set('Authorization', `Bearer ${token}`);
        } else {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
    }

    const response = await originalFetch(resource, config);

    // Handle 401 Unauthorized globally (exclude login endpoint itself)
    if (response.status === 401) {
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
