import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft } from 'lucide-react';

const NotFound = () => {
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
        <AlertCircle size={36} />
      </div>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--slate-900)', marginBottom: '0.5rem' }}>
        404 - Page Not Found
      </h1>
      <p style={{ color: 'var(--slate-500)', maxWidth: '460px', margin: '0 auto 2rem auto' }}>
        The requested URL does not match any route in the RideFlow distributed system portal.
      </p>
      <Link to="/" className="btn btn-primary">
        <ArrowLeft size={16} /> Return to System Overview
      </Link>
    </div>
  );
};

export default NotFound;
