
import React, { createContext, useContext, useState, useEffect } from 'react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

const AuthContext = createContext(null);

const clearAuthSession = () => {
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
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('authToken');
        const userStr = localStorage.getItem('currentUser');

        if (token && userStr && !isJwtExpired(token)) {
            setIsAuthenticated(true);
            try {
                const cachedUser = JSON.parse(userStr);
                setCurrentUser(cachedUser);

                fetch(`${getApiBaseUrl()}/api/auth/me`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
                    .then((response) => {
                        if (!response.ok) throw new Error(`Auth refresh failed: ${response.status}`);
                        return response.json();
                    })
                    .then((freshUser) => {
                        const mergedUser = { ...cachedUser, ...freshUser };
                        localStorage.setItem('currentUser', JSON.stringify(mergedUser));
                        sessionStorage.setItem('currentUser', JSON.stringify(mergedUser));
                        setCurrentUser(mergedUser);
                    })
                    .catch((error) => {
                        console.error('Failed to refresh user session:', error);
                    });
            } catch (e) {
                console.error('Failed to parse user data');
                clearAuthSession();
            }
        } else if (token || userStr) {
            clearAuthSession();
        }
        setIsLoading(false);

        const handleAuthError = () => {
            setIsAuthenticated(false);
            setCurrentUser(null);
            clearAuthSession();
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

        window.addEventListener('auth-error', handleAuthError);
        window.addEventListener('password-change-required', handlePasswordChangeRequired);
        return () => {
            window.removeEventListener('auth-error', handleAuthError);
            window.removeEventListener('password-change-required', handlePasswordChangeRequired);
        };
    }, []);

    const login = (token, user) => {
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
        clearAuthSession();
        setCurrentUser(null);
        setIsAuthenticated(false);
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, currentUser, isLoading, login, logout }}>
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
