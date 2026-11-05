
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { clearManagementFilters } from '@/lib/managementFilterSession';
import { clearChatDrafts } from '@/lib/teamChatDrafts';

const AuthContext = createContext(null);

const clearAuthSession = (queryClient) => {
    // Las respuestas incluyen permisos y contenido propios de la sesión que las pidió.
    // clear también cancela lecturas pendientes para que no repueblen la caché después de salir.
    queryClient?.clear();
    clearChatDrafts();
    clearManagementFilters(sessionStorage);
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('currentUser');
};

const decodeJwtPayload = (token) => {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const json = decodeURIComponent(
            atob(base64)
                .split('')
                .map((char) => `%${(`00${char.charCodeAt(0).toString(16)}`).slice(-2)}`)
                .join('')
        );
        return JSON.parse(json);
    } catch (error) {
        console.error('Failed to decode auth token:', error);
        return null;
    }
};

const isJwtExpired = (token) => {
    const payload = decodeJwtPayload(token);
    if (!payload?.exp) return true;
    return payload.exp * 1000 <= Date.now();
};

export const AuthProvider = ({ children }) => {
    const queryClient = useContext(QueryClientContext);
    const authRefreshAbort = useRef(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const controller = new AbortController();
        authRefreshAbort.current = controller;
        const token = localStorage.getItem('authToken');
        const userStr = localStorage.getItem('currentUser');

        if (token && userStr && !isJwtExpired(token)) {
            setIsAuthenticated(true);
            try {
                const cachedUser = JSON.parse(userStr);
                setCurrentUser(cachedUser);

                fetch(`${getApiBaseUrl()}/api/auth/me`, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: controller.signal
                })
                    .then((response) => {
                        if (!response.ok) throw new Error(`Auth refresh failed: ${response.status}`);
                        return response.json();
                    })
                    .then((freshUser) => {
                        if (controller.signal.aborted || localStorage.getItem('authToken') !== token) return;
                        const mergedUser = { ...cachedUser, ...freshUser };
                        localStorage.setItem('currentUser', JSON.stringify(mergedUser));
                        sessionStorage.setItem('currentUser', JSON.stringify(mergedUser));
                        setCurrentUser(mergedUser);
                    })
                    .catch((error) => {
                        if (controller.signal.aborted || localStorage.getItem('authToken') !== token) return;
                        console.error('Failed to refresh user session:', error);
                    });
            } catch (e) {
                console.error('Failed to parse user data');
                clearAuthSession(queryClient);
            }
        } else {
            clearAuthSession(queryClient);
        }
        setIsLoading(false);

        const handleAuthError = () => {
            authRefreshAbort.current?.abort();
            setIsAuthenticated(false);
            setCurrentUser(null);
            clearAuthSession(queryClient);
        };

        const handlePasswordChangeRequired = () => {
            const current = localStorage.getItem('currentUser');
            if (!current) return;
            try {
                const user = { ...JSON.parse(current), mustChangePassword: true };
                localStorage.setItem('currentUser', JSON.stringify(user));
                sessionStorage.setItem('currentUser', JSON.stringify(user));
                setCurrentUser(user);
                setIsAuthenticated(true);
            } catch (error) {
                console.error('Failed to mark password change as required:', error);
            }
        };

        // Rol con verificación en dos pasos obligatoria y aún sin activar (27 de septiembre de 2026).
        const handleMfaEnrollmentRequired = () => {
            const current = localStorage.getItem('currentUser');
            if (!current) return;
            try {
                const user = { ...JSON.parse(current), mfaEnrollmentRequired: true };
                localStorage.setItem('currentUser', JSON.stringify(user));
                sessionStorage.setItem('currentUser', JSON.stringify(user));
                setCurrentUser(user);
                setIsAuthenticated(true);
            } catch (error) {
                console.error('Failed to mark MFA enrollment as required:', error);
            }
        };

        window.addEventListener('auth-error', handleAuthError);
        window.addEventListener('password-change-required', handlePasswordChangeRequired);
        window.addEventListener('mfa-enrollment-required', handleMfaEnrollmentRequired);
        return () => {
            controller.abort();
            if (authRefreshAbort.current === controller) authRefreshAbort.current = null;
            window.removeEventListener('auth-error', handleAuthError);
            window.removeEventListener('password-change-required', handlePasswordChangeRequired);
            window.removeEventListener('mfa-enrollment-required', handleMfaEnrollmentRequired);
        };
    }, [queryClient]);

    // Cambios del propio usuario que confirmó el servidor (p. ej. MFA activado).
    const updateCurrentUser = (patch) => {
        setCurrentUser((previous) => {
            if (!previous) return previous;
            const next = { ...previous, ...patch };
            localStorage.setItem('currentUser', JSON.stringify(next));
            sessionStorage.setItem('currentUser', JSON.stringify(next));
            return next;
        });
    };

    const login = (token, user) => {
        authRefreshAbort.current?.abort();
        queryClient?.clear();
        clearChatDrafts();
        clearManagementFilters(sessionStorage);
        localStorage.setItem('authToken', token);
        localStorage.setItem('currentUser', JSON.stringify(user));
        // Also keep sessionStorage for the interceptor if it's still looking there,
        // but we updated main.jsx. Better safe than sorry for consistency across existing code.
        sessionStorage.setItem('authToken', token);
        sessionStorage.setItem('currentUser', JSON.stringify(user));
        setCurrentUser(user);
        setIsAuthenticated(true);
    };

    const logout = () => {
        authRefreshAbort.current?.abort();
        clearAuthSession(queryClient);
        setCurrentUser(null);
        setIsAuthenticated(false);
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, currentUser, isLoading, login, logout, updateCurrentUser }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
