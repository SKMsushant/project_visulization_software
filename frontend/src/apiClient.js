// CODE FOR: frontend/src/apiClient.js

import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

// Base URL points to your Django backend
const API_BASE_URL = 'http://localhost:8000/api'; 

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Create a separate instance for refresh to avoid interceptor loops
const axiosRefresh = axios.create({
    baseURL: API_BASE_URL,
});

// REQUEST INTERCEPTOR: Attach JWT token and handle refresh
apiClient.interceptors.request.use(
    async (config) => {
        // Skip token attachment for auth endpoints
        const isAuthEndpoint = config.url.includes('/token/') || 
                              config.url.includes('/verify-challenge/') ||
                              config.url.includes('/register/');
        
        if (isAuthEndpoint) {
            return config;
        }

        const accessToken = localStorage.getItem('accessToken');
        
        if (accessToken) {
            // FIX: Remove all jwtDecode and pre-emptive refresh logic.
            // Only attach the token. The server's 401/403 response will handle refresh.
            config.headers.Authorization = `Bearer ${accessToken}`;
        }
        
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// RESPONSE INTERCEPTOR: Handle errors
apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        const status = error.response ? error.response.status : null;
        
        // Check if the request was to an auth endpoint
        const isAuthEndpoint = originalRequest.url.includes('/token/') || 
                              originalRequest.url.includes('/verify-challenge/') ||
                              originalRequest.url.includes('/register/');

        // For auth endpoints, just pass the error through
        if (isAuthEndpoint) {
            return Promise.reject(error);
        }

        // For 401/403 on protected resources, the token is invalid
        if (status === 401 || status === 403) {
            console.error('Session expired or access denied. Logging out...');
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            window.location.href = '/login';
        }

        return Promise.reject(error);
    }
);

export default apiClient;