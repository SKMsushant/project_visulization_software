// CODE FOR: frontend/src/AuthContext.js

import React, { createContext, useContext, useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(undefined); // Start as undefined
    
    // Check for valid token on mount
    useEffect(() => {
        const checkAuth = () => {
            const accessToken = localStorage.getItem('accessToken');
            
            if (!accessToken) {
                setIsAuthenticated(false);
                setUser(null);
                return;
            }

            try {
                const decodedToken = jwtDecode(accessToken);
                
                // Check if token is expired
                if (decodedToken.exp < Date.now() / 1000) {
                    console.warn('Token expired on mount');
                    localStorage.removeItem('accessToken');
                    localStorage.removeItem('refreshToken');
                    setIsAuthenticated(false);
                    setUser(null);
                    return;
                }

                // Token is valid
                setIsAuthenticated(true);
                setUser({
                    username: decodedToken.username || 'User',
                    email: decodedToken.email || '',
                    user_id: decodedToken.user_id
                });
                
            } catch (error) {
                console.error('Invalid token:', error);
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                setIsAuthenticated(false);
                setUser(null);
            }
        };

        checkAuth();
    }, []);

    const login = (userData, tokens) => {
        // Store tokens using consistent key names
        if (tokens) {
            localStorage.setItem('accessToken', tokens.access);
            localStorage.setItem('refreshToken', tokens.refresh);
        }
        
        setUser(userData);
        setIsAuthenticated(true);
    };

    const logout = () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        setUser(null);
        setIsAuthenticated(false);
    };

    return (
        <AuthContext.Provider value={{ user, isAuthenticated, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);