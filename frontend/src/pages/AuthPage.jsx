import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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
  Zap, 
  Car, 
  Navigation, 
  Shield 
} from 'lucide-react';
import './AuthPage.css';

const AuthPage = () => {
  const { login, register, demoLogin, user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState('login'); // 'login' or 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('PASSENGER');

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);

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
        const registeredUser = await register({ email, password, name, phone, role });
        setSuccessMsg(`Account created for ${registeredUser.name}!`);
        redirectByRole(registeredUser.role);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoClick = async (demoRole) => {
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const loggedIn = await demoLogin(demoRole);
      setSuccessMsg(`Authenticated as ${loggedIn.role} (${loggedIn.name})`);
      redirectByRole(loggedIn.role);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Demo login failed');
    } finally {
      setLoading(false);
    }
  };

  const redirectByRole = (userRole) => {
    setTimeout(() => {
      if (userRole === 'DRIVER') navigate('/driver');
      else if (userRole === 'ADMIN') navigate('/admin');
      else navigate('/passenger');
    }, 600);
  };

  return (
    <div className="container auth-container-page">
      <div className="auth-card">
        {/* Header */}
        <div className="auth-header">
          <div className="auth-brand-badge">
            <ShieldCheck size={20} />
            <span>JWT & RBAC Security Layer</span>
          </div>
          <h2 className="auth-title">
            {mode === 'login' ? 'Sign In to RideFlow' : 'Create an Account'}
          </h2>
          <p className="auth-subtitle">
            Role-Based Access Control authenticated via bcrypt password hashing and JSON Web Tokens.
          </p>
        </div>

        {/* 1-Click Evaluator Demo Persona Bar */}
        <div className="demo-persona-box">
          <div className="demo-persona-label">
            <Zap size={14} className="zap-icon" /> 1-Click Academic Evaluation Personas
          </div>
          <div className="demo-buttons-grid">
            <button 
              type="button" 
              className="demo-btn demo-btn-passenger"
              onClick={() => handleDemoClick('PASSENGER')}
              disabled={loading}
            >
              <Car size={16} />
              <span>Passenger</span>
            </button>
            <button 
              type="button" 
              className="demo-btn demo-btn-driver"
              onClick={() => handleDemoClick('DRIVER')}
              disabled={loading}
            >
              <Navigation size={16} />
              <span>Driver</span>
            </button>
            <button 
              type="button" 
              className="demo-btn demo-btn-admin"
              onClick={() => handleDemoClick('ADMIN')}
              disabled={loading}
            >
              <Shield size={16} />
              <span>Admin</span>
            </button>
          </div>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="auth-mode-tabs">
          <button 
            type="button" 
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError(null); }}
          >
            <LogIn size={16} /> Sign In
          </button>
          <button 
            type="button" 
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => { setMode('register'); setError(null); }}
          >
            <UserPlus size={16} /> Register
          </button>
        </div>

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

        {/* Form */}
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
                    placeholder="e.g. Aarav Sharma"
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

              <div className="form-group">
                <label className="form-label">Select Account Role</label>
                <div className="role-selector-grid">
                  <label className={`role-radio-card ${role === 'PASSENGER' ? 'selected' : ''}`}>
                    <input 
                      type="radio" 
                      name="role" 
                      value="PASSENGER" 
                      checked={role === 'PASSENGER'}
                      onChange={() => setRole('PASSENGER')}
                    />
                    <Car size={18} />
                    <span className="role-name">Passenger</span>
                  </label>
                  <label className={`role-radio-card ${role === 'DRIVER' ? 'selected' : ''}`}>
                    <input 
                      type="radio" 
                      name="role" 
                      value="DRIVER" 
                      checked={role === 'DRIVER'}
                      onChange={() => setRole('DRIVER')}
                    />
                    <Navigation size={18} />
                    <span className="role-name">Driver</span>
                  </label>
                </div>
              </div>
            </>
          )}

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div className="input-icon-wrap">
              <Mail size={18} className="input-icon" />
              <input
                type="email"
                required
                placeholder="name@example.com"
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
            {mode === 'register' && (
              <span className="form-help">Hashed securely via bcrypt (10 rounds).</span>
            )}
          </div>

          <button 
            type="submit" 
            className="btn btn-primary auth-submit-btn"
            disabled={loading}
          >
            {loading ? 'Authenticating...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {isAuthenticated && (
          <div className="current-session-box">
            <span>Currently logged in as: <b>{user.name}</b> ({user.email})</span>
            <button type="button" onClick={logout} className="logout-link">
              Sign Out
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthPage;

