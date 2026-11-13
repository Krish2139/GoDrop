import React, { createContext, useContext, useState, useEffect } from 'react';
import apiClient from '../api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('rideflow_token') || null);
  const [loading, setLoading] = useState(true);

  // Load existing session on startup
  useEffect(() => {
    const verifySession = async () => {
      const storedToken = localStorage.getItem('rideflow_token');
      if (!storedToken) {
        setLoading(false);
        return;
      }

      try {
        const response = await apiClient.get('/auth/me', {
          headers: { Authorization: `Bearer ${storedToken}` }
        });
        if (response.data.success) {
          setUser(response.data.user);
          setToken(storedToken);
        }
      } catch (err) {
        console.warn('Session verification expired or failed. Clearing stored credentials.');
        localStorage.removeItem('rideflow_token');
        localStorage.removeItem('rideflow_user');
        setUser(null);
        setToken(null);
      } finally {
        setLoading(false);
      }
    };

    verifySession();
  }, []);

  const login = async (email, password) => {
    const response = await apiClient.post('/auth/login', { email, password });
    if (response.data.success) {
      const { token: receivedToken, user: receivedUser } = response.data;
      localStorage.setItem('rideflow_token', receivedToken);
      localStorage.setItem('rideflow_user', JSON.stringify(receivedUser));
      setToken(receivedToken);
      setUser(receivedUser);
      return receivedUser;
    }
    throw new Error(response.data.message || 'Login failed');
  };

  const register = async (userData) => {
    const response = await apiClient.post('/auth/register', userData);
    if (response.data.success) {
      const { token: receivedToken, user: receivedUser } = response.data;
      localStorage.setItem('rideflow_token', receivedToken);
      localStorage.setItem('rideflow_user', JSON.stringify(receivedUser));
      setToken(receivedToken);
      setUser(receivedUser);
      return receivedUser;
    }
    throw new Error(response.data.message || 'Registration failed');
  };

  const logout = () => {
    localStorage.removeItem('rideflow_token');
    localStorage.removeItem('rideflow_user');
    setToken(null);
    setUser(null);
  };

  // Quick 1-click Demo Persona Selector for academic evaluation
  const demoLogin = async (role) => {
    const credentials = {
      PASSENGER: { email: 'passenger@rideflow.io', password: 'pass123' },
      DRIVER: { email: 'driver@rideflow.io', password: 'driver123' },
      ADMIN: { email: 'admin@rideflow.io', password: 'admin123' },
    };

    const cred = credentials[role];
    if (cred) {
      return await login(cred.email, cred.password);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        role: user?.role || null,
        loading,
        login,
        register,
        logout,
        demoLogin,
      }}
    >
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
