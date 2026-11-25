import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { navigateToPortal, getPortalUrl } from '../utils/portalRouter';
import { 
  ShieldCheck, 
  LogIn, 
  UserPlus, 
  Key, 
  Mail, 
  User, 
  Phone, 
  AlertCircle, 
  CheckCircle2, 
  Car, 
  ArrowLeft
} from 'lucide-react';
import './AuthPage.css';

const AuthPage = () => {
  const { login, register, user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const isDriverPort = window.location.port === '3001';
  const isPassengerPort = window.location.port === '3003';
  const isAdminPort = window.location.port === '3002';
  const roleQuery = searchParams.get('role')?.toUpperCase();
  const modeQuery = searchParams.get('mode')?.toLowerCase();

  // If user accesses /auth on the wrong port for the requested role, auto-redirect to the official port:
  // Home: 3000, Driver: 3001, Admin: 3002, Passenger: 3003
  useEffect(() => {
    const currentPort = window.location.port;
    if (!currentPort) return;

    if ((roleQuery === 'DRIVER' || isDriverPort) && currentPort !== '3001') {
      navigateToPortal('DRIVER', `/auth?role=driver${modeQuery ? `&mode=${modeQuery}` : ''}`, null, true);
    } else if ((roleQuery === 'ADMIN' || isAdminPort) && currentPort !== '3002') {
      navigateToPortal('ADMIN', `/auth?role=admin${modeQuery ? `&mode=${modeQuery}` : ''}`, null, true);
    } else if ((roleQuery === 'PASSENGER' || isPassengerPort) && currentPort !== '3003') {
      navigateToPortal('PASSENGER', `/auth?role=passenger${modeQuery ? `&mode=${modeQuery}` : ''}`, null, true);
    }
  }, [roleQuery, modeQuery, isDriverPort, isAdminPort, isPassengerPort]);

  const getInitialRole = () => {
    if (roleQuery === 'ADMIN' || isAdminPort) return 'ADMIN';
    if (roleQuery === 'DRIVER' || isDriverPort) return 'DRIVER';
    return 'PASSENGER';
  };

  const [role, setRole] = useState(getInitialRole());
  const [mode, setMode] = useState(modeQuery === 'register' ? 'register' : 'login'); // 'login' or 'register'

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleModel, setVehicleModel] = useState('Toyota Innova (Silver)');
  const [licensePlate, setLicensePlate] = useState(() => {
    const l1 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const l2 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const num = Math.floor(1000 + Math.random() * 9000);
    return `GJ-01-${l1}${l2}-${num}`;
  });

  const [error, setError] = useState(() => {
    const authErr = sessionStorage.getItem('rideflow_auth_error');
    if (authErr) {
      sessionStorage.removeItem('rideflow_auth_error');
      return authErr;
    }
    return null;
  });
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);

  // Sync role & mode from URL if search params change, defaulting by port
  useEffect(() => {
    if (roleQuery === 'ADMIN' || isAdminPort) {
      setRole('ADMIN');
    } else if (roleQuery === 'DRIVER' || isDriverPort) {
      setRole('DRIVER');
    } else if (roleQuery === 'PASSENGER' || isPassengerPort) {
      setRole('PASSENGER');
    }
    if (modeQuery === 'register' || modeQuery === 'login') {
      setMode(modeQuery);
    }
  }, [roleQuery, modeQuery, isDriverPort, isPassengerPort, isAdminPort]);

  const handleModeChange = (newMode) => {
    setMode(newMode);
    setError(null);
    setSuccessMsg(null);
    setSearchParams({ role: role.toLowerCase(), mode: newMode });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const loggedInUser = await login(email, password);
        setSuccessMsg(`Welcome back, ${loggedInUser.name}!`);
        redirectByRole(loggedInUser.role);
      } else {
        const payload = {
          email,
          password,
          name,
          phone: phone || '+91 90000 00000',
          role,
          ...(role === 'DRIVER' ? { vehicle_model: vehicleModel, license_plate: licensePlate } : {})
        };
        const registeredUser = await register(payload);
        if (role === 'DRIVER') {
          setSuccessMsg(`Driver application submitted for ${registeredUser.name}! Your account is pending administrator verification. Redirecting to driver terminal...`);
          setTimeout(() => navigateToPortal('DRIVER', '/driver', navigate), 1600);
        } else {
          setSuccessMsg(`Account created for ${registeredUser.name}!`);
          redirectByRole(registeredUser.role);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const redirectByRole = (userRole) => {
    setTimeout(() => {
      if (userRole === 'DRIVER') navigateToPortal('DRIVER', '/driver', navigate);
      else if (userRole === 'ADMIN') navigateToPortal('ADMIN', '/admin', navigate);
      else navigateToPortal('PASSENGER', '/passenger', navigate);
    }, 600);
  };

  const handleSignOut = () => {
    logout();
    navigateToPortal('PASSENGER', '/', navigate);
  };

  const isDriver = role === 'DRIVER';
  const isAdmin = role === 'ADMIN';

  return (
    <div className={`auth-container-page ${isAdmin ? 'admin-auth-page' : isDriver ? 'driver-auth-page' : 'passenger-auth-page'}`}>
      <div className={`auth-card glass-auth-card ${isAdmin ? 'admin-auth-card' : isDriver ? 'driver-auth-card' : 'passenger-auth-card'}`}>
        {/* Back Link */}
        <div style={{ marginBottom: '1.25rem' }}>
          <a href={getPortalUrl('PASSENGER', '/')} className="auth-back-link">
            <ArrowLeft size={15} /> Back to Overview
          </a>
        </div>

        {/* Header */}
        <div className="auth-header" style={{ marginBottom: '1.25rem' }}>
          <h2 className="auth-title">
            {isAdmin 
              ? 'Administrator Sign In' 
              : isDriver 
                ? (mode === 'login' ? 'Driver Sign In' : 'Register as Driver') 
                : (mode === 'login' ? 'Passenger Sign In' : 'Create Passenger Account')}
          </h2>
          <p style={{ color: 'var(--slate-500)', fontSize: '0.85rem', marginTop: '0.35rem' }}>
            {isAdmin 
              ? 'Access real-time fleet operations, God-view map, revenue analytics, and driver approvals.' 
              : isDriver 
                ? (mode === 'login' ? 'Sign in to access your vehicle terminal and receive dispatch offers.' : 'Join the GoDrop fleet. Your application will be verified by an administrator before rides become available.')
                : (mode === 'login' ? 'Sign in to book rides and track live driver dispatch in Ahmedabad.' : 'Sign up to start booking rides across Ahmedabad.')}
          </p>
        </div>

        {/* Quick Demo Credentials Autofill for Admin */}
        {isAdmin && (
          <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px' }}>
            <span style={{ fontSize: '0.8rem', color: '#1E40AF', fontWeight: 600 }}>Demo Admin Credentials:</span>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem' }}>
              <code style={{ fontSize: '0.75rem', color: '#1D4ED8' }}>admin@rideflow.io / admin123</code>
              <button 
                type="button" 
                onClick={() => { setEmail('admin@rideflow.io'); setPassword('admin123'); }} 
                className="btn btn-outline"
                style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderColor: '#93C5FD', color: '#1D4ED8' }}
              >
                Auto-Fill
              </button>
            </div>
          </div>
        )}

        {/* Mode Switcher Tabs (Sign In vs Register) - Hidden if Admin */}
        {!isAdmin && (
          <div className="auth-mode-tabs">
            <button 
              type="button" 
              className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => handleModeChange('login')}
            >
              <LogIn size={16} /> Sign In
            </button>
            <button 
              type="button" 
              className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => handleModeChange('register')}
            >
              <UserPlus size={16} /> Register
            </button>
          </div>
        )}

        {/* Feedback alerts */}
        {error && (
          <div className="auth-alert alert-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="auth-alert alert-success">
            <CheckCircle2 size={18} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Authentication Form */}
        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'register' && (
            <>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <div className="input-icon-wrap">
                  <User size={18} className="input-icon" />
                  <input
                    type="text"
                    required
                    placeholder={isDriver ? "e.g. Rajesh Kumar" : "e.g. Aarav Sharma"}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <div className="input-icon-wrap">
                  <Phone size={18} className="input-icon" />
                  <input
                    type="tel"
                    placeholder="e.g. +91 98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              {isDriver && (
                <>
                  <div className="form-group">
                    <label className="form-label">Vehicle Model & Color</label>
                    <div className="input-icon-wrap">
                      <Car size={18} className="input-icon" />
                      <input
                        type="text"
                        required
                        placeholder="e.g. Toyota Innova (Silver)"
                        value={vehicleModel}
                        onChange={(e) => setVehicleModel(e.target.value)}
                        className="form-input"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">License Plate Number</label>
                    <div className="input-icon-wrap">
                      <ShieldCheck size={18} className="input-icon" />
                      <input
                        type="text"
                        required
                        placeholder="e.g. GJ-01-XY-1234"
                        value={licensePlate}
                        onChange={(e) => setLicensePlate(e.target.value)}
                        className="form-input"
                      />
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div className="input-icon-wrap">
              <Mail size={18} className="input-icon" />
              <input
                type="email"
                required
                placeholder={isDriver ? "driver@godrop.io" : "passenger@godrop.io"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div className="input-icon-wrap">
              <Key size={18} className="input-icon" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
              />
            </div>
          </div>

          <button 
            type="submit" 
            className="btn btn-primary auth-submit-btn"
            disabled={loading}
          >
            {loading 
              ? 'Authenticating...' 
              : mode === 'login' 
                ? (isDriver ? 'Sign In to Driver Terminal' : 'Sign In as Passenger')
                : (isDriver ? 'Complete Driver Registration' : 'Create Passenger Account')}
          </button>
        </form>

        {isAuthenticated && (
          <div className="current-session-box">
            <span>Currently logged in: <b>{user.name}</b> ({user.role})</span>
            <button type="button" onClick={handleSignOut} className="logout-link">
              Sign Out
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthPage;
