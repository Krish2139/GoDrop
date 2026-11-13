import React from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, ArrowLeft, LogIn } from 'lucide-react';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="container" style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--slate-500)' }}>Verifying security credentials...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="container" style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          backgroundColor: 'var(--warning-bg)',
          color: '#D97706',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.5rem auto'
        }}>
          <LogIn size={32} />
        </div>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--slate-900)', marginBottom: '0.75rem' }}>
          Authentication Required
        </h2>
        <p style={{ color: 'var(--slate-600)', maxWidth: '480px', margin: '0 auto 1.5rem auto' }}>
          This portal is protected by RideFlow API Gateway role-based authorization. Please sign in to access this module.
        </p>
        <Link to="/auth" className="btn btn-primary">
          <LogIn size={16} /> Go to Sign In
        </Link>
      </div>
    );
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="container" style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          backgroundColor: 'var(--danger-bg)',
          color: '#DC2626',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.5rem auto'
        }}>
          <ShieldAlert size={34} />
        </div>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--slate-900)', marginBottom: '0.5rem' }}>
          403 Forbidden: Access Denied
        </h2>
        <p style={{ color: 'var(--slate-600)', maxWidth: '520px', margin: '0 auto 1.5rem auto' }}>
          Your current account role is <span className="badge badge-warning">{user.role}</span>. 
          This portal requires one of the following roles: <b>[{allowedRoles.join(', ')}]</b>.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
          <Link to="/" className="btn btn-outline">
            <ArrowLeft size={16} /> System Overview
          </Link>
          <Link to="/auth" className="btn btn-secondary">
            Switch Account
          </Link>
        </div>
      </div>
    );
  }

  return children;
};

export default ProtectedRoute;

