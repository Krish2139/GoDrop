import React, { createContext, useContext, useState, useEffect } from 'react';
import apiClient from '../api/client';
import { disconnectSocket } from '../services/socket';

export const KNOWN_DRIVERS = [
  { id: 'driver-seed-1', name: 'Rajesh Prajapati', email: 'driver@rideflow.io', vehicle: 'Toyota Prius (White)', plate: 'GJ-01-AB-1234', location: 'SG Highway (Iscon)' },
  { id: 'driver-seed-2', name: 'Priya Desai', email: 'driver2@rideflow.io', vehicle: 'Hyundai Verna (Silver)', plate: 'GJ-01-CD-5678', location: 'Vastrapur Lake' },
  { id: 'driver-seed-3', name: 'Amit Mehta', email: 'driver3@rideflow.io', vehicle: 'Honda City (Black)', plate: 'GJ-01-EF-9012', location: 'CG Road' },
  { id: 'driver-seed-4', name: 'Suresh Solanki', email: 'driver4@rideflow.io', vehicle: 'Maruti Dzire (White)', plate: 'GJ-27-GH-3456', location: 'Sabarmati Riverfront' },
  { id: 'driver-seed-5', name: 'Deepak Joshi', email: 'driver5@rideflow.io', vehicle: 'Tata Nexon EV (Teal)', plate: 'GJ-01-IJ-7890', location: 'SVPIA Airport' },
  { id: 'driver-1795091909068', name: 'Sahil Parikh', email: 'sahil@gmail.com', vehicle: 'Kia Sonnet (Black)', plate: 'GJ-01-XY-7895', location: 'Ahmedabad Junction' },
];

export const KNOWN_PASSENGERS = [
  { id: 'pass-seed-1', name: 'Aarav Patel', email: 'passenger@rideflow.io', phone: '+91 98250 12345' },
  { id: 'pass-seed-2', name: 'Neha Shah', email: 'neha@rideflow.io', phone: '+91 98250 54321' },
];

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const getStoredToken = () => (
    sessionStorage.getItem('rideflow_token') ||
    sessionStorage.getItem('godrop_token') ||
    localStorage.getItem('rideflow_token') ||
    localStorage.getItem('godrop_token') ||
    null
  );

  const [user, setUser] = useState(null);
  const [token, setToken] = useState(getStoredToken());
  const [loading, setLoading] = useState(true);

  // Load existing session on startup
  useEffect(() => {
    const verifySession = async () => {
      const storedToken = getStoredToken();
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
          sessionStorage.setItem('rideflow_token', storedToken);
          sessionStorage.setItem('rideflow_user', JSON.stringify(response.data.user));
        }
      } catch (err) {
        console.warn('Session verification expired or failed. Clearing stored credentials.');
        sessionStorage.removeItem('rideflow_token');
        sessionStorage.removeItem('rideflow_user');
        localStorage.removeItem('rideflow_token');
        localStorage.removeItem('rideflow_user');
        setUser(null);
        setToken(null);
      } finally {
        setLoading(false);
      }
    };

    verifySession();

    const handleForceLogout = () => {
      disconnectSocket();
      sessionStorage.removeItem('rideflow_token');
      sessionStorage.removeItem('rideflow_user');
      sessionStorage.removeItem('godrop_token');
      sessionStorage.removeItem('godrop_user');
      localStorage.removeItem('rideflow_token');
      localStorage.removeItem('rideflow_user');
      localStorage.removeItem('godrop_token');
      localStorage.removeItem('godrop_user');
      setToken(null);
      setUser(null);
      setLoading(false);
    };

    window.addEventListener('rideflow:force-logout', handleForceLogout);
    return () => window.removeEventListener('rideflow:force-logout', handleForceLogout);
  }, []);

  const login = async (email, password) => {
    disconnectSocket();
    const response = await apiClient.post('/auth/login', { email, password });
    if (response.data.success) {
      const { token: receivedToken, user: receivedUser } = response.data;
      sessionStorage.setItem('rideflow_token', receivedToken);
      sessionStorage.setItem('rideflow_user', JSON.stringify(receivedUser));
      localStorage.setItem('rideflow_token', receivedToken);
      localStorage.setItem('rideflow_user', JSON.stringify(receivedUser));
      setToken(receivedToken);
      setUser(receivedUser);
      return receivedUser;
    }
    throw new Error(response.data.message || 'Login failed');
  };

  const register = async (userData) => {
    disconnectSocket();
    const response = await apiClient.post('/auth/register', userData);
    if (response.data.success) {
      const { token: receivedToken, user: receivedUser } = response.data;
      sessionStorage.setItem('rideflow_token', receivedToken);
      sessionStorage.setItem('rideflow_user', JSON.stringify(receivedUser));
      localStorage.setItem('rideflow_token', receivedToken);
      localStorage.setItem('rideflow_user', JSON.stringify(receivedUser));
      setToken(receivedToken);
      setUser(receivedUser);
      return receivedUser;
    }
    throw new Error(response.data.message || 'Registration failed');
  };

  const logout = () => {
    disconnectSocket();
    sessionStorage.removeItem('rideflow_token');
    sessionStorage.removeItem('rideflow_user');
    sessionStorage.removeItem('godrop_token');
    sessionStorage.removeItem('godrop_user');
    localStorage.removeItem('rideflow_token');
    localStorage.removeItem('rideflow_user');
    localStorage.removeItem('godrop_token');
    localStorage.removeItem('godrop_user');
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

  // Switch to specific driver account
  const switchDriver = async (email) => {
    return await login(email, 'driver123');
  };

  // Switch to specific passenger account
  const switchPassenger = async (email, password = 'pass123') => {
    return await login(email, password);
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
        switchDriver,
        switchPassenger,
        knownDrivers: KNOWN_DRIVERS,
        knownPassengers: KNOWN_PASSENGERS,
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

