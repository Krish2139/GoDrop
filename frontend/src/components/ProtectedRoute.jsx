import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getPortalUrl } from '../utils/portalRouter';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, isAuthenticated, loading } = useAuth();
  const currentPort = window.location.port;
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;

  // Determine portal role and official port from allowedRoles
  let targetRole = 'passenger';
  let targetPort = '3003';
  let targetPath = '/passenger';

  if (allowedRoles?.length === 1 && allowedRoles[0] === 'ADMIN') {
    targetRole = 'admin';
    targetPort = '3002';
    targetPath = '/admin';
  } else if (allowedRoles?.includes('DRIVER') && !allowedRoles?.includes('PASSENGER')) {
    targetRole = 'driver';
    targetPort = '3001';
    targetPath = '/driver';
  }

  // Enforce official port mapping:
  // Home: 3000, Driver: 3001, Admin: 3002, Passenger: 3003
  useEffect(() => {
    if (currentPort && currentPort !== targetPort) {
      window.location.replace(`${protocol}//${hostname}:${targetPort}${targetPath}`);
    }
  }, [currentPort, targetPort, targetPath, protocol, hostname]);

  if (currentPort && currentPort !== targetPort) {
    return (
      <div className="container" style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--slate-500)' }}>Redirecting to official port :{targetPort}...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container" style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--slate-500)' }}>Verifying security credentials...</p>
      </div>
    );
  }

  if (!isAuthenticated || (allowedRoles && !allowedRoles.includes(user?.role))) {
    const authUrl = getPortalUrl(targetRole, `/auth?role=${targetRole}`);
    if (authUrl.startsWith('http://') || authUrl.startsWith('https://')) {
      window.location.replace(authUrl);
      return null;
    }
    return <Navigate to={authUrl} replace />;
  }

  return children;
};

export default ProtectedRoute;
